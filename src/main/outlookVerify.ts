import { ImapFlow } from "imapflow";

export async function verifyOutlookMailbox(input: { user: string; accessToken: string; host: string; port: number }): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = new ImapFlow({
    host: input.host,
    port: input.port,
    secure: true,
    auth: { user: input.user, accessToken: input.accessToken },
    logger: false,
    logRaw: false,
    disableAutoIdle: true,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const exists = client.mailbox && typeof client.mailbox === "object" ? client.mailbox.exists || 0 : 0;
      if (exists > 0) await client.fetchOne(String(exists), { uid: true });
    } finally {
      lock.release();
    }
    await client.logout();
    return { ok: true };
  } catch (error) {
    try {
      client.close();
    } catch {
      /* already closed */
    }
    const message = error instanceof Error ? error.message : "IMAP 连接失败";
    return { ok: false, message: message.replace(input.accessToken, "[token]") };
  }
}
