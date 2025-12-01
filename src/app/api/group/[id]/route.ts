import { auth } from "@/lib/shared/auth";
import { prisma } from "@/lib/shared/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET (req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const groupId = Number(id);

    if (Number.isNaN(groupId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const group = await prisma.financialGroup.findUnique({
      where: { id: groupId },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        transactions: {
          orderBy: { createdAt: "desc" },
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
            userCategory: true,
            groupCategory: true,
            bankAccount: true,
          },
        },
      },
    });

    if (!group) {
      return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
    }

    const isMember = group.members.some((m) => m.userId === session.user.userId);

    if (!isMember) {
      return NextResponse.json({ error: "Acesso não autorizado ao grupo" }, { status: 403 });
    }

    const members = group.members.map((m) => ({
      id: m.id,
      userId: m.userId,
      joinedAt: m.joinedAt,
      user: {
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
      },
    }));

    const transactions = group.transactions.map((t) => {
      let category = null;

      if (t.userCategory) {
        category = { id: t.userCategory.id, name: t.userCategory.name };
      } else if (t.groupCategory) {
        category = { id: t.groupCategory.id, name: t.groupCategory.name };
      }

      return {
        id: t.id,
        amount: t.amount,
        type: t.type,
        description: t.description,
        status: t.status,
        createdAt: t.createdAt,
        createdBy: t.createdBy ? { id: t.createdBy.id, name: t.createdBy.name } : null,
        category,
        paymentMethod: t.paymentMethod,
        bankAccount: t.bankAccount ? { id: t.bankAccount.id, name: t.bankAccount.name } : null,
      };
    });

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        type: group.type,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      },
      members,
      transactions,
    });
  } catch (error) {
    console.error("Erro ao buscar grupo:", error);

    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
