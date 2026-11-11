  // KI-Interview: erst Fragen stellen, dann To-dos schreiben und ordnen
  'POST /api/interview': [
    requireAuth(),
    async ctx => {
      const b = (ctx.body || {}) as { step?: unknown; tasks?: unknown; notes?: unknown; answers?: unknown };
      const tasks = (Array.isArray(b.tasks) ? b.tasks : [])
        .slice(0, 60)
        .map(t => t as { id?: unknown; text?: unknown; imp?: unknown; urg?: unknown })
        .filter(t => typeof t.id === 'string' && typeof t.text === 'string')
        .map(t => ({
          id: String(t.id).slice(0, 40),
          text: String(t.text).slice(0, 160),
          imp: t.imp === true,
          urg: t.urg === true,
        }));
      const notes = typeof b.notes === 'string' ? b.notes.slice(0, 4000) : '';
      const sys =
        'Du bist ein ruhiger, direkter Produktivitäts-Coach in einer deutschen To-do-App. Du duzt, schreibst kurz und konkret, ohne Floskeln.';
      if (b.step === 'ask') {
        try {
          const res = await aiJson({
            system: sys,
            prompt:
              'Offene Aufgaben: ' +
              JSON.stringify(tasks.map(t => t.text)) +
              '\nNotizen: ' +
              JSON.stringify(notes.slice(0, 1500)) +
              '\nStelle 3 bis 5 kurze Fragen (je max. 14 Wörter), mit denen du herausfindest, was die Person heute und diese Woche am meisten weiterbringt: Ziele, Fristen, verfügbare Zeit, was sie vor sich herschiebt. Beziehe dich wenn sinnvoll auf ihre Aufgaben oder Notizen.',
            schema: {
              type: 'object',
              properties: { questions: { type: 'array', items: { type: 'string' } } },
              required: ['questions'],
            },
            thinkingMode: 'NONE',
            maxTokens: 400,
            temperature: 0.5,
          });
          const out = JSON.parse(res.text || '{}') as { questions?: unknown };
          const qs = Array.isArray(out.questions)
            ? out.questions.filter((q): q is string => typeof q === 'string' && q.trim().length > 3).slice(0, 5).map(q => q.slice(0, 140))
            : [];
          return json({ questions: qs });
        } catch (err) {
          console.warn('interview ask failed', String(err));
          return json({ questions: [] });
        }
      }
      const answers = (Array.isArray(b.answers) ? b.answers : [])
        .slice(0, 8)
        .map(a => a as { q?: unknown; a?: unknown })
        .map(a => ({ q: typeof a.q === 'string' ? a.q.slice(0, 160) : '', a: typeof a.a === 'string' ? a.a.slice(0, 4000) : '' }))
        .filter(a => a.a.trim());
      try {
        const res = await aiJson({
          system: sys,
          prompt:
            'Vorhandene offene Aufgaben (id, text, wichtig, dringend): ' +
            JSON.stringify(tasks) +
            '\nNotizen: ' +
            JSON.stringify(notes.slice(0, 2500)) +
            '\nAntworten der Person: ' +
            JSON.stringify(answers) +
            '\n\nErstelle daraus eine geordnete Liste von 3 bis 10 To-dos für heute – das, was die Person am meisten weiterbringt, zuerst. ' +
            'Nutze vorhandene Aufgaben, wenn sie passen (ref = deren id, text = deren Text). Neue Aufgaben: ref = "", text kurz und konkret mit Verb (max. 70 Zeichen). ' +
            'Große Vorhaben in einen machbaren ersten Schritt zerlegen. min = geschätzte Minuten (5–120). why = ein kurzer Grund (max. 12 Wörter). ' +
            'imp = wichtig für die Ziele, urg = hat eine Frist heute/morgen. intro = ein Satz, worauf es heute ankommt.',
          schema: {
            type: 'object',
            properties: {
              intro: { type: 'string' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    ref: { type: 'string' },
                    imp: { type: 'boolean' },
                    urg: { type: 'boolean' },
                    min: { type: 'number' },
                    why: { type: 'string' },
                  },
                  required: ['text', 'ref', 'imp', 'urg', 'min', 'why'],
                },
              },
            },
            required: ['intro', 'items'],
          },
          thinkingMode: 'NONE',
          maxTokens: 1500,
          temperature: 0.4,
        });
        const out = JSON.parse(res.text || '{}') as { intro?: unknown; items?: unknown };
        const ids = new Set(tasks.map(t => t.id));
        const seen = new Set<string>();
        const items = (Array.isArray(out.items) ? out.items : [])
          .map(i => i as { text?: unknown; ref?: unknown; imp?: unknown; urg?: unknown; min?: unknown; why?: unknown })
          .filter(i => typeof i.text === 'string' && i.text.trim())
          .map(i => {
            const ref = typeof i.ref === 'string' && ids.has(i.ref) ? i.ref : '';
            return {
              text: String(i.text).trim().slice(0, 120),
              ref,
              imp: i.imp === true,
              urg: i.urg === true,
              min: typeof i.min === 'number' ? Math.max(5, Math.min(240, Math.round(i.min))) : 0,
              why: typeof i.why === 'string' ? i.why.slice(0, 120) : '',
            };
          })
          .filter(i => {
            const k = i.ref || i.text.toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .slice(0, 12);
        return json({ intro: typeof out.intro === 'string' ? out.intro.slice(0, 240) : '', items, via: res.via });
      } catch (err) {
        console.warn('interview plan failed', String(err));
        return error('KI nicht erreichbar', 503);
      }
    },
  ],

