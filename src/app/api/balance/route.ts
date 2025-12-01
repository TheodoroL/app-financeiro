import { auth } from "@/lib/shared/auth";
import { prisma } from "@/lib/shared/prisma";

export async function GET () {
  try {
    const session = await auth();

    if (!session?.user) {
      return Response.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { userId } = session.user;

    const userGroups = await prisma.financialGroupMember.findMany({
      where: { userId },
      include: { financialGroup: { include: { transactions: true } } },
    });

    const createdGroups = await prisma.financialGroup.findMany({
      where: { ownerId: userId },
      include: { transactions: true },
    });

    const allGroups = [
      ...userGroups.map((member) => member.financialGroup),
      ...createdGroups.filter(
        (group) => !userGroups.some((member) => member.financialGroup.id === group.id),
      ),
    ];

    let totalBalance = 0;
    const balanceByGroup = [];

    for (const group of allGroups) {
      let groupBalance = 0;

      for (const transaction of group.transactions) {
        if (transaction.status === "PAID") {
          groupBalance += transaction.type === "INCOME" ? transaction.amount : -transaction.amount;
        }
      }

      totalBalance += groupBalance;

      balanceByGroup.push({
        groupId: group.id,
        groupName: group.name,
        balance: groupBalance,
        transactionCount: group.transactions.length,
      });
    }

    // Buscar saldos das contas bancárias do usuário
    const bankAccounts = await prisma.bankAccount.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true, bank: true, balance: true },
    });

    // Calcular saldo real das contas considerando transações pagas
    const bankAccountsWithRealBalance = await Promise.all(
      bankAccounts.map(async (account) => {
        const transactions = await prisma.transaction.findMany({ where: { bankAccountId: account.id, status: "PAID" } });

        const transactionBalance = transactions.reduce(
          (sum, t) => sum + (t.type === "INCOME" ? t.amount : -t.amount),
          0,
        );

        return { ...account, realBalance: account.balance + transactionBalance };
      }),
    );

    const totalBankBalance = bankAccountsWithRealBalance.reduce(
      (sum, account) => sum + account.realBalance,
      0,
    );

    // Saldo líquido real
    const realNetBalance = totalBalance + totalBankBalance;

    return Response.json(
      {
        totalBalance, // saldo dos grupos
        totalBankBalance, // saldo real das contas bancárias
        consolidatedBalance: realNetBalance, // saldo em dinheiro
        balanceByGroup,
        bankAccounts: bankAccountsWithRealBalance,
        summary: {
          totalGroups: allGroups.length,
          totalBankAccounts: bankAccounts.length,
          lastUpdated: new Date().toISOString(),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Erro ao buscar saldo:", error);

    return Response.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
