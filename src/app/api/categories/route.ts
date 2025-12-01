import { auth } from "@/lib/shared/auth";
import { prisma } from "@/lib/shared/prisma";
import { NextRequest } from "next/server";

export async function GET (request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return Response.json({ error: "Não autorizado" }, { status: 401 });
    }

    const url = new URL(request.url);
    const groupIdParam = url.searchParams.get("groupId");

    if (!groupIdParam) {
      return Response.json({ error: "groupId é obrigatório" }, { status: 400 });
    }

    const groupId = parseInt(groupIdParam);

    if (isNaN(groupId)) {
      return Response.json({ error: "groupId inválido" }, { status: 400 });
    }

    const isMember = await prisma.financialGroupMember.findFirst({ where: { userId: session.user.userId, financialGroupId: groupId } });

    if (!isMember) {
      return Response.json({ error: "Acesso negado ao grupo" }, { status: 403 });
    }

    const categories = await prisma.groupCategory.findMany({
      where: { groupId },
      orderBy: { name: "asc" },
    });

    return Response.json({ categories }, { status: 200 });
  } catch (error) {
    console.error("Erro ao buscar categorias:", error);

    return Response.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function POST (request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return Response.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { name, groupId } = body;

    if (!name || !groupId) {
      return Response.json({ error: "Nome e groupId são obrigatórios" }, { status: 400 });
    }

    const isMember = await prisma.financialGroupMember.findFirst({ where: { userId: session.user.userId, financialGroupId: groupId } });

    if (!isMember) {
      return Response.json({ error: "Acesso negado ao grupo" }, { status: 403 });
    }

    const existingCategory = await prisma.groupCategory.findFirst({ where: { name, groupId } });

    if (existingCategory) {
      return Response.json({ error: "Categoria já existe neste grupo" }, { status: 409 });
    }

    const newCategory = await prisma.groupCategory.create({ data: { name, groupId } });

    return Response.json(newCategory, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar categoria:", error);

    return Response.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
