import { productName } from "@/lib/brand";
import { getPrisma, isUniqueConstraint } from "@/lib/db";
import { sendOpsEmail } from "@/lib/email/resend";
import {
  alertRecipients,
  dayKey,
  selectUserOutliers,
  spendThresholds,
  utcDay,
} from "@/lib/admin/spend";

export type SpendCheckResult = {
  connected: boolean;
  day: string;
  dailyTotal: number;
  dailyTriggered: boolean;
  outlierCount: number;
  emailsSent: number;
  recorded: number;
};

export async function runSpendAlerts(now = new Date()): Promise<SpendCheckResult> {
  const empty: SpendCheckResult = {
    connected: false,
    day: dayKey(utcDay(now)),
    dailyTotal: 0,
    dailyTriggered: false,
    outlierCount: 0,
    emailsSent: 0,
    recorded: 0,
  };
  const prisma = getPrisma();
  if (!prisma) return empty;
  const day = utcDay(now);
  const rows = await prisma.usageEntry.findMany({
    where: { day },
    select: {
      estimatedCostUsd: true,
      repo: { select: { installation: { select: { userId: true } } } },
    },
  });
  const byUser = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    const cost = Number(row.estimatedCostUsd);
    total += cost;
    const userId = row.repo.installation.userId;
    if (!userId) continue;
    byUser.set(userId, (byUser.get(userId) ?? 0) + cost);
  }
  const thresholds = spendThresholds();
  const recipients = alertRecipients(process.env.SPEND_ALERT_EMAILS);
  const outliers = selectUserOutliers(
    Array.from(byUser, ([userId, costUsd]) => ({ userId, costUsd })),
    { minUsd: thresholds.userUsd, multiple: thresholds.userMultiple },
  );

  let emailsSent = 0;
  let recorded = 0;
  let dailyTriggered = false;

  if (total >= thresholds.dailyUsd) {
    dailyTriggered = true;
    const key = `daily:${dayKey(day)}`;
    const exists = await prisma.spendAlert.findUnique({ where: { scopeKey: key } });
    if (!exists) {
      const send = await safeSend(
        recipients,
        `${productName()} AI spend above $${thresholds.dailyUsd}`,
        `Estimated AI spend for ${dayKey(day)} is $${total.toFixed(2)}, above the daily threshold of $${thresholds.dailyUsd}.\n`,
      );
      if (send) {
        emailsSent += 1;
        try {
          await prisma.spendAlert.create({
            data: {
              scopeKey: key,
              kind: "DAILY_TOTAL",
              day,
              amountUsd: total,
            },
          });
          recorded += 1;
        } catch (error) {
          if (!isUniqueConstraint(error)) throw error;
        }
      }
    }
  }

  for (const outlier of outliers) {
    const key = `user:${dayKey(day)}:${outlier.userId}`;
    const exists = await prisma.spendAlert.findUnique({ where: { scopeKey: key } });
    if (exists) continue;
    const user = await prisma.user.findUnique({
      where: { id: outlier.userId },
      select: { login: true, email: true },
    });
    const send = await safeSend(
      recipients,
      `${productName()} user spend outlier: ${user?.login ?? outlier.userId}`,
      `${user?.login ?? outlier.userId} used $${outlier.costUsd.toFixed(2)} in estimated AI spend on ${dayKey(day)}. Threshold is $${thresholds.userUsd} and ${thresholds.userMultiple}x the median.\n`,
    );
    if (send) {
      emailsSent += 1;
      try {
        await prisma.spendAlert.create({
          data: {
            scopeKey: key,
            kind: "USER_OUTLIER",
            day,
            userId: outlier.userId,
            amountUsd: outlier.costUsd,
          },
        });
        recorded += 1;
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error;
      }
    }
  }

  return {
    connected: true,
    day: dayKey(day),
    dailyTotal: total,
    dailyTriggered,
    outlierCount: outliers.length,
    emailsSent,
    recorded,
  };
}

async function safeSend(to: string[], subject: string, text: string): Promise<boolean> {
  if (to.length === 0) return false;
  try {
    const result = await sendOpsEmail({ to, subject, text });
    return result.delivered;
  } catch {
    return false;
  }
}
