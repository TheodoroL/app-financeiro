import logger from "@/lib/server/logger";
import { auth } from "@/lib/shared/auth";
import { prisma } from "@/lib/shared/prisma";
import { TransactionSchema } from "@/lib/shared/schemas/transaction";
import { NextRequest } from "next/server";

export async function GET () {
  try {
    const session = await auth();

    if (session === null || !session.user) {
      return Response.json({ error: "Não autorizado" }, { status: 401 });
    }

    const transactions = await prisma.transaction.findMany({
      where: { createdById: session.user.userId },
      include: {
        group: true,
        userCategory: true,
        groupCategory: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    logger.info(`Obtendo ${transactions.length} transações para usuário ${session.user.userId}`);

    return Response.json({
      data: transactions,
      count: transactions.length,
    });
  } catch (error) {
    logger.error(error, "Erro ao obter transações");

    return Response.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function POST (request: NextRequest) {
  try {
    const session = await auth();

    if (session === null || !session.user) {
      return Response.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { success, data, error } = await TransactionSchema.safeParseAsync(body);

    if (!success) {
      return Response.json({
        error: "Dados inválidos",
        details: error.issues,
      }, { status: 400 });
    }

    const { groupId } = data;

    const group = await prisma.financialGroup.findFirst({
      where: {
        id: groupId,
        members: { some: { userId: session.user.userId } },
      },
    });

    if (!group) {
      return Response.json({ error: "Grupo não encontrado" }, { status: 404 });
    }

    // Verificar se a categoria existe (se fornecida)
    if (data.categoryId) {
      const userCategory = await prisma.userCategory.findUnique({ where: { id: data.categoryId } });
      const groupCategory = await prisma.groupCategory.findUnique({ where: { id: data.categoryId } });

      if (!userCategory && !groupCategory) {
        return Response.json({ error: "Categoria não encontrada" }, { status: 404 });
      }
    }

    const transaction = await prisma.transaction.create({
      data: {
        amount: data.amount,
        type: data.type,
        status: data.status || "PENDING",
        description: data.description,
        paymentMethod: "PIX", // Valor padrão, pode ser customizado
        createdById: session.user.userId,
        groupId: group.id,
        bankAccountId: data.bankAccountId,
      },
      include: {
        userCategory: true,
        groupCategory: true,
        group: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        bankAccount: true,
      },
    });

    // Atualizar saldo da conta bancária (se fornecida)
    if (data.bankAccountId && data.status === "PAID") {
      await prisma.bankAccount.update({
        where: { id: data.bankAccountId },
        data: { balance: { [data.type === "INCOME" ? "increment" : "decrement"]: data.amount } },
      });
    }

    logger.info(`Transação criada com sucesso para usuário ${session.user.userId}`);

    return Response.json({
      data: transaction,
      message: "Transação criada com sucesso",
    }, { status: 201 });
  } catch (error) {
    logger.error(error, "Erro ao criar transação");

    return Response.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
