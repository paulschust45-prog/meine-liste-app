  // Einsatz (Strafzahlung mit Unterschrift) – Testphase ohne Abbuchung
  'GET /api/pledges': [
    requireAuth(),
    async ctx => {
      const [rec] = await db.get<{ items?: unknown[] }>('pledges', [ctx.user!.userId], { consistent: true });
      return json({ items: rec && Array.isArray(rec.items) ? rec.items : [] });
    },
  ],
  'POST /api/pledge': [
    requireAuth(),
    async ctx => {
      const b = (ctx.body || {}) as Record<string, unknown>;
      const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
      const task = str(b.task, 160);
      const name = str(b.name, 80);
      const summary = str(b.summary, 800);
      const amount = typeof b.amount === 'number' ? Math.round(b.amount) : 0;
      const deadline = str(b.deadline, 40);
      const dl = Date.parse(deadline);
      const recipient = b.recipient === 'app' || b.recipient === 'friend' ? b.recipient : 'charity';
      const sig = typeof b.signature === 'string' ? b.signature : '';
      if (!task || name.length < 3 || !summary) return error('Angaben fehlen', 400);
      if (amount < 100 || amount > 50000) return error('Betrag ungültig', 400);
      if (!dl || dl < Date.now() + 5 * 60 * 1000) return error('Frist ungültig', 400);
      if (b.consent !== true || b.adult !== true) return error('Zustimmung fehlt', 400);
      if (!sig || sig.length > 1500000) return error('Unterschrift fehlt', 400);
      const uid = ctx.user!.userId;
      const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const [ok] = await storage.write([{ path: 'pledges/' + uid + '/' + id + '.png', content: sig, contentType: 'image/png' }]);
      if (!ok) return error('Unterschrift konnte nicht gespeichert werden', 500);
      const ev = (ctx.event || {}) as { headers?: Record<string, string>; requestContext?: { http?: { sourceIp?: string } } };
      const pledge = {
        id,
        taskId: str(b.taskId, 40),
        task,
        amount,
        currency: 'EUR',
        deadline: new Date(dl).toISOString(),
        proof: b.proof !== false,
        recipient,
        friend: str(b.friend, 60),
        name,
        summary,
        version: str(b.version, 40),
        createdAt: Date.now(),
        status: 'active',
        testPhase: true,
        // Nachweis der Zustimmung
        email: ctx.user!.email || '',
        ua: str(ev.headers?.['user-agent'] || ev.headers?.['User-Agent'], 300),
        ip: str(ev.requestContext?.http?.sourceIp, 60),
        signature: 'pledges/' + uid + '/' + id + '.png',
      };
      const [old] = await db.get<{ items?: unknown[] }>('pledges', [uid], { consistent: true });
      const items = [pledge, ...(old && Array.isArray(old.items) ? old.items : [])].slice(0, 200);
      await db.tx.update('pledges', [{ id: uid, record: { items } }]);
      return json({ pledge });
    },
  ],
  'POST /api/pledge/resolve': [
    requireAuth(),
    async ctx => {
      const b = (ctx.body || {}) as { id?: unknown; status?: unknown };
      const st = b.status === 'kept' || b.status === 'failed' || b.status === 'cancelled' ? b.status : '';
      if (typeof b.id !== 'string' || !st) return error('Ungültig', 400);
      const uid = ctx.user!.userId;
      const [old] = await db.get<{ items?: Record<string, unknown>[] }>('pledges', [uid], { consistent: true });
      const items = old && Array.isArray(old.items) ? old.items : [];
      const it = items.find(x => x.id === b.id);
      if (!it) return error('Nicht gefunden', 404);
      if (it.status !== 'active') return json({ pledge: it });
      const now = Date.now();
      if (st === 'cancelled' && now - Number(it.createdAt || 0) > 15 * 60 * 1000) return error('Zurückziehen nur in den ersten 15 Minuten', 403);
      if (st === 'failed' && now < Date.parse(String(it.deadline))) return error('Frist läuft noch', 400);
      const next = { ...it, status: st, resolvedAt: now };
      await db.tx.update('pledges', [{ id: uid, record: { items: items.map(x => (x.id === b.id ? next : x)) } }]);
      return json({ pledge: next });
    },
  ],

