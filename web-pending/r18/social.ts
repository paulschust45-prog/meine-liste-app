  // ---------- Challenge-Räume (wie Outdo: Freunde, Code, Live-Rangliste) ----------
  'GET /api/rooms': [
    requireAuth(),
    async ctx => {
      const uid = ctx.user!.userId;
      const [mine] = await db.get<{ codes?: string[] }>('myrooms', [uid], { consistent: true });
      const codes = (mine?.codes || []).slice(0, 10);
      if (!codes.length) return json({ rooms: [] });
      const recs = await db.get<RoomRec>('rooms', codes, { consistent: true });
      const day = typeof ctx.query?.day === 'string' ? ctx.query.day : '';
      const rooms = codes
        .map((code, i) => {
          const r = recs[i];
          if (!r) return null;
          const members = Object.entries(r.members || {})
            .map(([id, m]) => ({
              me: id === uid,
              name: m.name,
              pts: m.day === day ? m.pts : 0,
              done: m.day === day ? m.done : 0,
              min: m.day === day ? m.min : 0,
              ts: m.ts,
            }))
            .sort((a, b) => b.pts - a.pts || a.ts - b.ts);
          return { code, name: r.name, members };
        })
        .filter(Boolean);
      return json({ rooms });
    },
  ],
  'POST /api/room': [
    requireAuth(),
    async ctx => {
      const b = (ctx.body || {}) as { action?: unknown; code?: unknown; name?: unknown; display?: unknown };
      const uid = ctx.user!.userId;
      const display = (typeof b.display === 'string' ? b.display.trim() : '').slice(0, 24) || 'Jemand';
      const [mine] = await db.get<{ codes?: string[] }>('myrooms', [uid], { consistent: true });
      const codes = mine?.codes || [];
      const me: RoomMember = { name: display, pts: 0, done: 0, min: 0, day: '', ts: Date.now() };
      if (b.action === 'create') {
        if (codes.length >= 10) return error('Höchstens 10 Räume', 400);
        const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let tries = 0; tries < 5 && !code; tries++) {
          const c = Array.from({ length: 6 }, () => A[Math.floor(Math.random() * A.length)]).join('');
          const [res] = await db.tx.add('rooms', [
            { id: c, name: (typeof b.name === 'string' ? b.name.trim() : '').slice(0, 40) || 'Challenge', owner: uid, members: { [uid]: me }, created: Date.now() },
          ]);
          if (res) code = c;
        }
        if (!code) return error('Bitte nochmal versuchen', 500);
        await db.tx.update('myrooms', [{ id: uid, record: { codes: [...codes, code] } }]);
        return json({ code });
      }
      const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : '';
      if (!/^[A-Z0-9]{6}$/.test(code)) return error('Code ungültig', 400);
      const [room] = await db.get<RoomRec>('rooms', [code], { consistent: true });
      if (!room) return error('Raum nicht gefunden', 404);
      const members = { ...(room.members || {}) };
      if (b.action === 'join') {
        if (!members[uid] && Object.keys(members).length >= 30) return error('Raum ist voll', 400);
        members[uid] = members[uid] ? { ...members[uid], name: display } : me;
        await db.tx.update('rooms', [{ id: code, record: { members } }], { patch: true });
        if (!codes.includes(code)) await db.tx.update('myrooms', [{ id: uid, record: { codes: [...codes, code].slice(-10) } }]);
        return json({ code });
      }
      if (b.action === 'leave') {
        delete members[uid];
        await db.tx.update('rooms', [{ id: code, record: { members } }], { patch: true });
        await db.tx.update('myrooms', [{ id: uid, record: { codes: codes.filter(c => c !== code) } }]);
        return json({ ok: true });
      }
      return error('Unbekannte Aktion', 400);
    },
  ],
  // Punkte des Tages in alle eigenen Räume schreiben
  'POST /api/room/score': [
    requireAuth(),
    async ctx => {
      const b = (ctx.body || {}) as { day?: unknown; pts?: unknown; done?: unknown; min?: unknown; display?: unknown };
      const uid = ctx.user!.userId;
      const day = typeof b.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : '';
      const num = (v: unknown, max: number) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
      if (!day) return error('Tag fehlt', 400);
      const [mine] = await db.get<{ codes?: string[] }>('myrooms', [uid], { consistent: true });
      const codes = (mine?.codes || []).slice(0, 10);
      if (!codes.length) return json({ ok: true });
      const recs = await db.get<RoomRec>('rooms', codes, { consistent: true });
      const updates = codes
        .map((code, i) => {
          const r = recs[i];
          if (!r || !r.members?.[uid]) return null;
          const m = r.members[uid];
          const name = (typeof b.display === 'string' ? b.display.trim().slice(0, 24) : '') || m.name;
          return {
            id: code,
            record: { members: { ...r.members, [uid]: { name, pts: num(b.pts, 5000), done: num(b.done, 200), min: num(b.min, 1440), day, ts: Date.now() } } },
          };
        })
        .filter((x): x is { id: string; record: { members: Record<string, RoomMember> } } => !!x);
      if (updates.length) await db.tx.update('rooms', updates, { patch: true });
      return json({ ok: true });
    },
  ],

  // ---------- Motivations-Coach ----------
  'POST /api/coach': [
    requireAuth(),
    async ctx => {
      const b = (ctx.body || {}) as Record<string, unknown>;
      const kind = b.kind === 'morning' ? 'morning' : 'done';
      const facts = JSON.stringify(b.ctx || {}).slice(0, 2500);
      try {
        const res = await aiJson({
          system:
            'Du bist ein Motivations-Coach in einer deutschen To-do-App. Du duzt, klingst wie ein ehrlicher Freund, nicht wie ein Werbetext. ' +
            'Keine Emojis, keine Floskeln wie "Du schaffst das!", keine Ausrufezeichen-Ketten. Konkret, warm, direkt. Höchstens 2 kurze Sätze.',
          prompt:
            (kind === 'morning'
              ? 'Schreib eine Morgen-Nachricht. Nenne, worauf es heute ankommt (die wichtigste Aufgabe), und – falls vorhanden – einen laufenden Einsatz oder die Challenge.'
              : 'Die Person hat gerade einen Fokus-Block beendet. Erkenne kurz an, was sie geschafft hat, und zeig den nächsten sinnvollen Schritt.') +
            '\nFakten: ' +
            facts,
          schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
          thinkingMode: 'NONE',
          maxTokens: 160,
          temperature: 0.7,
        });
        const out = JSON.parse(res.text || '{}') as { text?: unknown };
        return json({ text: typeof out.text === 'string' ? out.text.trim().slice(0, 280) : '' });
      } catch (err) {
        console.warn('coach failed', String(err));
        return json({ text: '' });
      }
    },
  ],

  // ---------- Einsatz mit Zeuge ----------
  // Öffentlich mit geheimem Link: Zeuge sieht Einsatz + Beweisfoto und bestätigt oder lehnt ab
  'GET /api/witness': [
    async ctx => {
      const t = (ctx.query && ctx.query.t) || '';
      if (!/^[a-z0-9]{16,40}$/.test(t)) return error('Link ungültig', 400);
      const [w] = await db.get<{ uid: string; pid: string }>('witness', [t], { consistent: true });
      if (!w) return error('Link ungültig', 404);
      const [rec] = await db.get<{ items?: Record<string, unknown>[] }>('pledges', [w.uid], { consistent: true });
      const it = (rec?.items || []).find(x => x.id === w.pid);
      if (!it) return error('Einsatz nicht gefunden', 404);
      let proofUrl: string | null = null;
      if (typeof it.proofDay === 'string' && typeof it.taskId === 'string' && it.taskId) {
        const [u] = await storage.url(['proofs/' + w.uid + '/' + it.taskId + '_' + it.proofDay]);
        proofUrl = u ? u.url : null;
      }
      return json({
        name: String(it.name || '').split(' ')[0],
        summary: it.summary,
        deadline: it.deadline,
        amount: it.amount,
        status: it.status,
        witness: it.witness || 'pending',
        proofUrl,
      });
    },
  ],
  'POST /api/witness': [
    async ctx => {
      const b = (ctx.body || {}) as { t?: unknown; verdict?: unknown; who?: unknown };
      const t = typeof b.t === 'string' ? b.t : '';
      const verdict = b.verdict === 'ok' ? 'ok' : b.verdict === 'no' ? 'no' : '';
      if (!/^[a-z0-9]{16,40}$/.test(t) || !verdict) return error('Ungültig', 400);
      const [w] = await db.get<{ uid: string; pid: string }>('witness', [t], { consistent: true });
      if (!w) return error('Link ungültig', 404);
      const [rec] = await db.get<{ items?: Record<string, unknown>[] }>('pledges', [w.uid], { consistent: true });
      const items = rec?.items || [];
      const it = items.find(x => x.id === w.pid);
      if (!it) return error('Einsatz nicht gefunden', 404);
      if (it.witness === 'ok' || it.witness === 'no') return json({ witness: it.witness, status: it.status });
      if (it.status !== 'kept') return error('Noch kein Beweis da', 400);
      const next = {
        ...it,
        witness: verdict,
        witnessBy: (typeof b.who === 'string' ? b.who.trim() : '').slice(0, 40),
        witnessAt: Date.now(),
        status: verdict === 'no' ? 'failed' : 'kept',
      };
      await db.tx.update('pledges', [{ id: w.uid, record: { items: items.map(x => (x.id === w.pid ? next : x)) } }]);
      try {
        await notifications.send({
          userIds: [w.uid],
          notification: {
            title: verdict === 'ok' ? 'Dein Zeuge hat bestätigt' : 'Dein Zeuge hat abgelehnt',
            body: String(it.task || ''),
            url: './',
          },
          data: { kind: 'witness' },
          ttlSeconds: 86400,
        });
      } catch {
        /* Push ist optional */
      }
      return json({ witness: verdict, status: next.status });
    },
  ],

