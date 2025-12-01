import logger from "@/lib/server/logger";
import { auth } from "@/lib/shared/auth";
import { HTTP_STATUS } from "@/lib/shared/constants";
import { prisma } from "@/lib/shared/prisma";

export async function GET () {
  const session = await auth();

  if (session === null) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const group = await prisma.financialGroup.findFirst({
    where: {
      ownerId: session.user.userId,
      type: "PERSONAL",
    },
    include: {
      members: true,
      transactions: {
        select: {
          id: true,
          amount: true,
          type: true,
          status: true,
          description: true,
          bankAccountId: true,
        },
      },
    },
  });

  if (!group) {
    return Response.json({ error: "Grupo pessoal não encontrado" }, { status: HTTP_STATUS.NOT_FOUND });
  }

  const transactionBalance = group.transactions.reduce((acc: number, t: { status: string; bankAccountId: number | null; type: string; amount: number }) => {
    if (t.status !== "PAID") {
      return acc;
    }

    if (t.bankAccountId) {
      return acc;
    }

    if (t.type === "INCOME") {
      return acc + t.amount;
    }
    if (t.type === "EXPENSE") {
      return acc - t.amount;
    }

    return acc;
  }, 0);

  const bankAccounts = await prisma.bankAccount.findMany({
    where: {
      userId: session.user.userId,
      isActive: true,
    },
    select: {
      id: true,
      balance: true,
    },
  });

  const bankBalance = bankAccounts.reduce((sum, account) => sum + account.balance, 0);

  const totalBalance = transactionBalance + bankBalance;

  logger.info(`Saldo calculado para grupo pessoal ${group.name} (ID: ${group.id}): Dinheiro: ${transactionBalance}, Contas: ${bankBalance}, Total: ${totalBalance}`);

  return Response.json({
    data: {
      id: group.id,
      name: group.name,
      description: group.description,
      balance: totalBalance,
      breakdown: {
        cashBalance: transactionBalance, // Transações em dinheiro
        bankBalance, // Saldo das contas bancárias
      },
    },
  });
}
