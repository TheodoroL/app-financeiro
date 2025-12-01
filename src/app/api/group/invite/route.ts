import { auth } from "@/lib/shared/auth";
import { prisma } from "@/lib/shared/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST (req: NextRequest) {
  const session = await auth();

  if (session === null || !session.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim();
  const groupId = Number(body?.groupId);

  if (!email || !groupId || Number.isNaN(groupId)) {
    return NextResponse.json({ error: "Dados obrigatórios" }, { status: 400 });
  }

  const group = await prisma.financialGroup.findUnique({
    where: { id: groupId },
    include: { members: true },
  });

  if (!group) {
    return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
  }

  const senderIsMember = group.members.some((m) => m.userId === session.user.userId);

  if (!senderIsMember) {
    return NextResponse.json({ error: "Acesso negado ao grupo" }, { status: 403 });
  }

  const targetUser = await prisma.user.findUnique({ where: { email } });

  if (!targetUser) {
    return NextResponse.json({ message: "Seu convite foi enviado, caso exista um usuário com este endereço de e-mail, ele será notificado." });
  }

  const alreadyMember = await prisma.financialGroupMember.findUnique({ where: { userId_financialGroupId: { userId: targetUser.id, financialGroupId: groupId } } });

  if (alreadyMember) {
    return NextResponse.json({ message: "Seu convite foi enviado, caso exista um usuário com este endereço de e-mail, ele será notificado." });
  }

  const existingInvitation = await prisma.groupInvitation.findFirst({
    where: {
      receiverId: targetUser.id,
      groupId,
      status: "PENDING",
    },
  });

  if (!existingInvitation) {
    await prisma.groupInvitation.create({
      data: {
        senderId: session.user.userId,
        receiverId: targetUser.id,
        groupId,
      },
    });
  }

  return NextResponse.json({ message: "Seu convite foi enviado, caso exista um usuário com este endereço de e-mail, ele será notificado." });
}

export async function PUT (req: NextRequest) {
  const session = await auth();

  if (session === null || !session.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id, status: invitationStatus } = await req.json();

  if (!id || !invitationStatus) {
    return NextResponse.json({ error: "Dados obrigatórios" }, { status: 400 });
  }

  const invitation = await prisma.groupInvitation.findUnique({ where: { id } });

  if (!invitation) {
    return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });
  }

  if (invitation.receiverId !== session.user.userId) {
    return NextResponse.json({ error: "Apenas o usuário convidado pode responder ao convite" }, { status: 403 });
  }

  if (invitationStatus === "ACCEPTED") {
    const alreadyMember = await prisma.financialGroupMember.findUnique({ where: { userId_financialGroupId: { userId: invitation.receiverId, financialGroupId: invitation.groupId } } });

    if (!alreadyMember) {
      // Cria membro simples (isOwner = false)
      await prisma.financialGroupMember.create({
        data: {
          userId: invitation.receiverId,
          financialGroupId: invitation.groupId,
        },
      });
    }
  }

  const updated = await prisma.groupInvitation.update({
    where: { id },
    data: { status: invitationStatus },
  });

  return NextResponse.json(updated);
}

export async function GET () {
  const session = await auth();

  if (session === null || !session.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const invitations = await prisma.groupInvitation.findMany({
    where: {
      receiverId: session.user.userId,
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
    include: {
      sender: { select: { id: true, name: true, email: true } },
      group: { select: { id: true, name: true } },
    },
  });

  const mapped = invitations.map((inv) => ({
    id: inv.id,
    sender: { id: inv.sender.id, name: inv.sender.name, email: inv.sender.email },
    group: { id: inv.group.id, name: inv.group.name },
    status: inv.status,
    createdAt: inv.createdAt,
  }));

  return NextResponse.json({ invitations: mapped });
}
