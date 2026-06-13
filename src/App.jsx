import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Lock, Trophy, Ticket, Settings, Check, Eye, EyeOff, RefreshCw, Crown } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ *
 *  BOLÃO DA FAMÍLIA · Brasil na Copa 2026 (Grupo C)
 *  - Cada pessoa entra com o nome e dá o placar dos 3 jogos do Brasil
 *  - Palpites ficam SECRETOS até o jogo travar (apito inicial) ou
 *    até o organizador lançar o placar oficial. Aí tudo é revelado.
 *  - Pontos: cravou o placar = 2 | acertou só o vencedor = 1 | errou = 0
 * ------------------------------------------------------------------ */

const ORG_CODE = "arichan"; // código que só o organizador conhece

const GAMES = [
  {
    id: "g1",
    group: "Grupo C · Rodada 1",
    home: { code: "BRA", name: "Brasil", flag: "🇧🇷" },
    away: { code: "MAR", name: "Marrocos", flag: "🇲🇦" },
    when: "Sáb 13/jun · 19h",
    venue: "Nova York / NJ",
    kickoff: "2026-06-13T22:00:00Z", // 19h Brasília
  },
  {
    id: "g2",
    group: "Grupo C · Rodada 2",
    home: { code: "BRA", name: "Brasil", flag: "🇧🇷" },
    away: { code: "HAI", name: "Haiti", flag: "🇭🇹" },
    when: "Sex 19/jun · 22h",
    venue: "Filadélfia",
    kickoff: "2026-06-20T01:00:00Z", // 22h Brasília
  },
  {
    id: "g3",
    group: "Grupo C · Rodada 3",
    home: { code: "ESC", name: "Escócia", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
    away: { code: "BRA", name: "Brasil", flag: "🇧🇷" },
    when: "Qua 24/jun · 19h",
    venue: "Miami",
    kickoff: "2026-06-24T22:00:00Z", // 19h Brasília
  },
];

/* --------------------------- armazenamento --------------------------- */
// Guarda palpites e placares no Supabase (tabela "kv"), compartilhado
// entre todos que abrirem o link. As chaves vêm das variáveis de ambiente
// VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (configuradas na Vercel).
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const store = {
  async list(prefix) {
    const { data, error } = await supabase.from("kv").select("key").like("key", `${prefix}%`);
    if (error) {
      console.error("list", error);
      return { keys: [] };
    }
    return { keys: (data || []).map((r) => r.key) };
  },
  async get(key) {
    const { data, error } = await supabase.from("kv").select("value").eq("key", key).maybeSingle();
    if (error || !data) return null;
    return { key, value: data.value };
  },
  async set(key, value) {
    const { error } = await supabase
      .from("kv")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) {
      console.error("set", error);
      return null;
    }
    return { key, value };
  },
};

/* ----------------------------- utils ----------------------------- */
const slug = (s) =>
  "p_" +
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const isNum = (v) => v !== "" && v !== null && v !== undefined && !Number.isNaN(Number(v));

function pointsFor(pred, res) {
  if (!pred || !res) return null;
  if (!isNum(pred.h) || !isNum(pred.a) || !isNum(res.h) || !isNum(res.a)) return null;
  const ph = +pred.h, pa = +pred.a, rh = +res.h, ra = +res.a;
  if (ph === rh && pa === ra) return 2;
  if (Math.sign(ph - pa) === Math.sign(rh - ra)) return 1;
  return 0;
}

const gameLocked = (game, results) => {
  const res = results[game.id];
  const finished = res && isNum(res.h) && isNum(res.a);
  const started = Date.now() >= new Date(game.kickoff).getTime();
  return { finished, started, locked: finished || started };
};

/* ============================== APP ============================== */
export default function App() {
  const [me, setMe] = useState(null); // {id, name}
  const [nameInput, setNameInput] = useState("");
  const [tab, setTab] = useState("palpites");
  const [players, setPlayers] = useState([]); // [{id,name,scores}]
  const [results, setResults] = useState({}); // {g1:{h,a}}
  const [myScores, setMyScores] = useState({}); // {g1:{h,a}}
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [orgUnlocked, setOrgUnlocked] = useState(false);
  const [tick, setTick] = useState(0); // re-render p/ atualizar locks no tempo

  // relógio leve: re-render a cada 30s para travar jogos no horário
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const { keys } = await store.list("pred:");
    const ps = [];
    for (const k of keys) {
      const r = await store.get(k);
      if (r && r.value) {
        try {
          ps.push(JSON.parse(r.value));
        } catch {}
      }
    }
    let res = {};
    const rr = await store.get("results");
    if (rr && rr.value) {
      try {
        res = JSON.parse(rr.value);
      } catch {}
    }
    setPlayers(ps);
    setResults(res);
    setLoading(false);
    return { ps, res };
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };

  const enterName = async () => {
    const name = nameInput.trim();
    if (name.length < 2) return;
    const id = slug(name);
    const { ps } = await loadAll();
    const mine = ps.find((p) => p.id === id);
    const start = {};
    GAMES.forEach((g) => {
      start[g.id] = mine?.scores?.[g.id] ? { ...mine.scores[g.id] } : { h: "", a: "" };
    });
    setMyScores(start);
    setMe({ id, name: mine?.name || name });
  };

  const setMyScore = (gid, side, val) => {
    const clean = val.replace(/[^0-9]/g, "").slice(0, 2);
    setMyScores((s) => ({ ...s, [gid]: { ...s[gid], [side]: clean } }));
  };

  const saveMyPicks = async () => {
    if (!me) return;
    setSaving(true);
    // só persiste jogos ainda abertos (não trava palpite já fechado)
    const existing = players.find((p) => p.id === me.id)?.scores || {};
    const scores = { ...existing };
    GAMES.forEach((g) => {
      const { locked } = gameLocked(g, results);
      const cur = myScores[g.id];
      if (!locked && cur && isNum(cur.h) && isNum(cur.a)) {
        scores[g.id] = { h: +cur.h, a: +cur.a };
      }
    });
    const record = { id: me.id, name: me.name, scores, updatedAt: Date.now() };
    await store.set(`pred:${me.id}`, JSON.stringify(record));
    await loadAll();
    setSaving(false);
    flash("Palpites salvos! Ficam secretos até o jogo começar.");
  };

  const saveResult = async (gid, h, a) => {
    const next = { ...results };
    if (isNum(h) && isNum(a)) next[gid] = { h: +h, a: +a };
    else delete next[gid];
    setResults(next);
    await store.set("results", JSON.stringify(next));
    flash("Placar oficial lançado!");
  };

  /* --------------------------- classificação --------------------------- */
  const standings = useMemo(() => {
    const rows = players.map((p) => {
      let pts = 0, cravadas = 0, acertos = 0, jogados = 0;
      GAMES.forEach((g) => {
        const res = results[g.id];
        if (!res || !isNum(res.h) || !isNum(res.a)) return;
        const pr = pointsFor(p.scores?.[g.id], res);
        if (pr === null) return; // não palpitou
        jogados++;
        pts += pr;
        if (pr === 2) cravadas++;
        if (pr >= 1) acertos++;
      });
      return { ...p, pts, cravadas, acertos, jogados };
    });
    rows.sort((a, b) => b.pts - a.pts || b.cravadas - a.cravadas || a.name.localeCompare(b.name));
    return rows;
  }, [players, results, tick]);

  const finishedGames = GAMES.filter((g) => gameLocked(g, results).locked);

  /* =============================== UI =============================== */
  return (
    <div className="bolao-root">
      <style>{CSS}</style>

      {!me ? (
        <Gate
          nameInput={nameInput}
          setNameInput={setNameInput}
          onEnter={enterName}
          count={players.length}
          loading={loading}
        />
      ) : (
        <div className="shell">
          <Header me={me} count={players.length} onRefresh={loadAll} />

          <nav className="tabs">
            <button className={tab === "palpites" ? "tab on" : "tab"} onClick={() => setTab("palpites")}>
              <Ticket size={16} /> Palpites
            </button>
            <button
              className={tab === "tabela" ? "tab on" : "tab"}
              onClick={() => {
                loadAll();
                setTab("tabela");
              }}
            >
              <Trophy size={16} /> Classificação
            </button>
            <button className={tab === "org" ? "tab on" : "tab"} onClick={() => setTab("org")}>
              <Settings size={16} /> Placares
            </button>
          </nav>

          {tab === "palpites" && (
            <Palpites
              myScores={myScores}
              setMyScore={setMyScore}
              results={results}
              players={players}
              me={me}
              onSave={saveMyPicks}
              saving={saving}
            />
          )}

          {tab === "tabela" && (
            <Tabela standings={standings} finishedGames={finishedGames} players={players} results={results} me={me} />
          )}

          {tab === "org" && (
            <Organizador
              results={results}
              onSave={saveResult}
              unlocked={orgUnlocked}
              setUnlocked={setOrgUnlocked}
            />
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ----------------------------- Portão ----------------------------- */
function Gate({ nameInput, setNameInput, onEnter, count, loading }) {
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="eyebrow">Copa 2026 · Grupo C</div>
        <h1 className="gate-title">
          BOLÃO DA<br />FAMÍLIA
        </h1>
        <p className="gate-sub">
          Palpite nos 3 jogos do Brasil. Cada aposta fica <b>secreta</b> até o apito inicial — aí revela todo mundo
          junto, com os pontos.
        </p>
        <div className="rules-row">
          <span className="pill gold">Cravou o placar · 2 pts</span>
          <span className="pill grass">Só o vencedor · 1 pt</span>
        </div>
        <label className="gate-label">Seu nome</label>
        <div className="gate-input">
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onEnter()}
            placeholder="Ex.: Tia Sônia"
            enterKeyHint="go"
            maxLength={28}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onEnter}
            disabled={nameInput.trim().length < 2}
          >
            Entrar
          </button>
        </div>
        <div className="gate-foot">
          {loading ? "carregando…" : `${count} ${count === 1 ? "pessoa já entrou" : "pessoas já entraram"}`}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Header ----------------------------- */
function Header({ me, count, onRefresh }) {
  return (
    <header className="hdr">
      <div>
        <div className="eyebrow">Bolão da Família · Copa 2026</div>
        <div className="hdr-me">
          Você é <b>{me.name}</b>
        </div>
      </div>
      <div className="hdr-right">
        <span className="hdr-count">{count} 👥</span>
        <button className="icon-btn" onClick={onRefresh} title="Atualizar">
          <RefreshCw size={16} />
        </button>
      </div>
    </header>
  );
}

/* --------------------------- Palpites tab --------------------------- */
function Palpites({ myScores, setMyScore, results, players, me, onSave, saving }) {
  return (
    <div className="pane">
      <div className="legend">
        <EyeOff size={14} /> Só você vê seus palpites. Eles travam no horário do jogo.
      </div>

      {GAMES.map((g) => {
        const { finished, started, locked } = gameLocked(g, results);
        const res = results[g.id];
        const cur = myScores[g.id] || { h: "", a: "" };
        const others = players.filter((p) => p.id !== me.id && p.scores?.[g.id]).length;

        return (
          <div className={"ticket" + (locked ? " locked" : "")} key={g.id}>
            <div className="ticket-top">
              <span className="ticket-group">{g.group}</span>
              {locked ? (
                <span className={"status " + (finished ? "done" : "live")}>
                  {finished ? "Encerrado" : "Bola rolando"}
                </span>
              ) : (
                <span className="ticket-when">{g.when}</span>
              )}
            </div>

            <div className="match">
              <Team t={g.home} />
              <div className="scorebox">
                <input
                  className="score-in"
                  inputMode="numeric"
                  value={cur.h}
                  disabled={locked}
                  onChange={(e) => setMyScore(g.id, "h", e.target.value)}
                  placeholder="–"
                  aria-label={`gols ${g.home.name}`}
                />
                <span className="x">×</span>
                <input
                  className="score-in"
                  inputMode="numeric"
                  value={cur.a}
                  disabled={locked}
                  onChange={(e) => setMyScore(g.id, "a", e.target.value)}
                  placeholder="–"
                  aria-label={`gols ${g.away.name}`}
                />
              </div>
              <Team t={g.away} right />
            </div>

            <div className="tear">
              <span className="notch l" />
              <span className="notch r" />
            </div>

            <div className="ticket-foot">
              <span className="venue">📍 {g.venue}</span>
              {locked ? (
                finished ? (
                  <span className="official">
                    Oficial: <b>{res.h}–{res.a}</b>
                  </span>
                ) : (
                  <span className="muted-foot">
                    <Lock size={12} /> palpites travados
                  </span>
                )
              ) : (
                <span className="muted-foot">
                  {others > 0 ? `${others} já palpitaram (em segredo)` : "ninguém palpitou ainda"}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <button className="save-btn" onClick={onSave} disabled={saving}>
        {saving ? "Salvando…" : "Salvar meus palpites"}
      </button>
    </div>
  );
}

function Team({ t, right }) {
  return (
    <div className={"team" + (right ? " right" : "")}>
      <span className="flag">{t.flag}</span>
      <span className="code">{t.code}</span>
    </div>
  );
}

/* -------------------------- Classificação -------------------------- */
function Tabela({ standings, finishedGames, players, results, me }) {
  const anyResult = finishedGames.length > 0;
  return (
    <div className="pane">
      <h2 className="pane-title">
        <Trophy size={18} /> Classificação
      </h2>

      {standings.length === 0 ? (
        <div className="empty">Ninguém entrou no bolão ainda. Manda o link pra galera!</div>
      ) : !anyResult ? (
        <div className="empty">
          A tabela aparece quando o primeiro jogo travar. Por enquanto está todo mundo zerado — e em segredo. 🤫
        </div>
      ) : (
        <div className="board">
          {standings.map((p, i) => (
            <div className={"row" + (p.id === me.id ? " mine" : "")} key={p.id}>
              <span className={"rank r" + (i + 1)}>{i === 0 ? <Crown size={15} /> : i + 1}</span>
              <span className="rname">
                {p.name}
                {p.id === me.id && <em> (você)</em>}
              </span>
              <span className="rmeta">
                {p.cravadas > 0 && <span className="crav">{p.cravadas} ⚡</span>}
              </span>
              <span className="rpts">{p.pts}</span>
            </div>
          ))}
        </div>
      )}

      {/* Revelação por jogo */}
      {finishedGames.map((g) => {
        const res = results[g.id];
        const finished = res && isNum(res.h) && isNum(res.a);
        const picks = players
          .filter((p) => p.scores?.[g.id])
          .map((p) => ({ name: p.name, ...p.scores[g.id], pts: finished ? pointsFor(p.scores[g.id], res) : null }))
          .sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1) || a.name.localeCompare(b.name));

        return (
          <div className="reveal" key={g.id}>
            <div className="reveal-head">
              <Eye size={14} />
              <span>
                {g.home.flag} {g.home.code} {finished ? `${res.h}–${res.a}` : "× "} {g.away.code} {g.away.flag}
              </span>
              <span className="reveal-tag">{finished ? "revelado" : "aguardando placar"}</span>
            </div>
            {picks.length === 0 ? (
              <div className="reveal-empty">ninguém palpitou neste jogo</div>
            ) : (
              picks.map((pk, idx) => (
                <div className="pick" key={idx}>
                  <span className="pk-name">{pk.name}</span>
                  <span className="pk-guess">
                    {pk.h}–{pk.a}
                  </span>
                  {finished && (
                    <span className={"pk-pts p" + pk.pts}>
                      {pk.pts === 2 ? "+2 ⚡" : pk.pts === 1 ? "+1" : "0"}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------- Organizador --------------------------- */
function Organizador({ results, onSave, unlocked, setUnlocked }) {
  const [draft, setDraft] = useState(() => {
    const d = {};
    GAMES.forEach((g) => {
      d[g.id] = results[g.id] ? { h: String(results[g.id].h), a: String(results[g.id].a) } : { h: "", a: "" };
    });
    return d;
  });

  const upd = (gid, side, val) =>
    setDraft((s) => ({ ...s, [gid]: { ...s[gid], [side]: val.replace(/[^0-9]/g, "").slice(0, 2) } }));

  const [code, setCode] = useState("");
  const [err, setErr] = useState(false);

  const tryUnlock = () => {
    if (code.trim().toLowerCase() === ORG_CODE) {
      setErr(false);
      setUnlocked(true);
    } else {
      setErr(true);
    }
  };

  if (!unlocked) {
    return (
      <div className="pane">
        <div className="org-gate">
          <Lock size={26} />
          <h2 className="pane-title">Área do organizador</h2>
          <p className="org-sub">
            Só <b>você</b> lança o placar oficial de cada jogo. Ao lançar, os palpites de todo mundo são revelados e a
            tabela é atualizada. Digite o código de organizador para abrir.
          </p>
          <div className="code-input">
            <input
              type="password"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setErr(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
              placeholder="Código de organizador"
              autoComplete="off"
            />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={tryUnlock} disabled={!code.trim()}>
              Entrar
            </button>
          </div>
          {err && <div className="code-err">Código incorreto. Tente de novo.</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="pane">
      <h2 className="pane-title">
        <Settings size={18} /> Lançar placares oficiais
      </h2>
      <p className="org-sub">Confirme o placar quando o jogo terminar. Isso revela os palpites e soma os pontos.</p>

      {GAMES.map((g) => {
        const saved = results[g.id];
        const d = draft[g.id];
        return (
          <div className="org-row" key={g.id}>
            <div className="org-match">
              <span>
                {g.home.flag} {g.home.code}
              </span>
              <input className="score-in dark" inputMode="numeric" value={d.h} onChange={(e) => upd(g.id, "h", e.target.value)} placeholder="–" />
              <span className="x">×</span>
              <input className="score-in dark" inputMode="numeric" value={d.a} onChange={(e) => upd(g.id, "a", e.target.value)} placeholder="–" />
              <span>
                {g.away.code} {g.away.flag}
              </span>
            </div>
            <div className="org-actions">
              <button className="mini-btn" disabled={!isNum(d.h) || !isNum(d.a)} onClick={() => onSave(g.id, d.h, d.a)}>
                <Check size={14} /> {saved ? "Atualizar" : "Lançar"}
              </button>
              {saved && (
                <button
                  className="mini-btn ghost"
                  onClick={() => {
                    upd(g.id, "h", "");
                    upd(g.id, "a", "");
                    onSave(g.id, "", "");
                  }}
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =============================== CSS =============================== */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800&display=swap');

.bolao-root{
  --pitch:#06140D; --pitch2:#0E2618; --panel:#102b1c;
  --line:rgba(255,255,255,.09); --line2:rgba(255,255,255,.16);
  --paper:#F0E7CC; --paper2:#E6DAB6; --ink:#173322; --ink-soft:#4a6450;
  --canary:#FFD200; --canary2:#E7B600; --grass:#22b463; --grass2:#34d27a;
  --text:#EAF3EC; --muted:#86a293;
  font-family:'Inter',system-ui,sans-serif;
  color:var(--text);
  background:
    radial-gradient(900px 500px at 50% -10%, rgba(34,180,99,.16), transparent 60%),
    linear-gradient(180deg,#08180F 0%, var(--pitch) 100%);
  min-height:100vh;
  -webkit-font-smoothing:antialiased;
}
*{box-sizing:border-box}
.bolao-root input{font-family:inherit}
.bolao-root button{touch-action:manipulation;-webkit-tap-highlight-color:transparent;cursor:pointer}
.bolao-root button:active:not(:disabled){transform:translateY(1px);opacity:.92}

.eyebrow{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--canary);font-weight:700}

/* ---- gate ---- */
.gate{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.gate-card{width:100%;max-width:420px;background:linear-gradient(180deg,var(--pitch2),#0a2014);
  border:1px solid var(--line);border-radius:22px;padding:30px 26px 24px;
  box-shadow:0 30px 80px rgba(0,0,0,.5)}
.gate-title{font-family:'Anton',sans-serif;font-weight:400;font-size:54px;line-height:.92;
  margin:10px 0 14px;letter-spacing:.01em;
  background:linear-gradient(180deg,#fff,var(--canary));-webkit-background-clip:text;background-clip:text;color:transparent}
.gate-sub{color:var(--muted);font-size:14px;line-height:1.55;margin:0 0 18px}
.gate-sub b{color:var(--text)}
.rules-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:22px}
.pill{font-size:12px;font-weight:600;padding:7px 12px;border-radius:999px;border:1px solid var(--line2)}
.pill.gold{color:var(--canary);background:rgba(255,210,0,.08);border-color:rgba(255,210,0,.3)}
.pill.grass{color:var(--grass2);background:rgba(34,180,99,.08);border-color:rgba(34,180,99,.3)}
.gate-label{display:block;font-size:12px;color:var(--muted);margin-bottom:7px;font-weight:600}
.gate-input{display:flex;flex-direction:column;gap:10px}
.gate-input input{width:100%;min-width:0;background:#071811;border:1px solid var(--line2);color:var(--text);
  padding:14px 16px;border-radius:12px;font-size:16px;outline:none}
.gate-input input:focus{border-color:var(--canary)}
.gate-input button{width:100%;background:var(--canary);color:#1a1300;border:none;font-weight:800;
  padding:15px 20px;border-radius:12px;font-size:16px;cursor:pointer}
.gate-input button:disabled{opacity:.4;cursor:not-allowed}
.gate-foot{margin-top:14px;font-size:12px;color:var(--muted);text-align:center}

/* ---- shell ---- */
.shell{max-width:560px;margin:0 auto;padding:16px 14px 60px}
.hdr{display:flex;justify-content:space-between;align-items:center;padding:6px 4px 14px}
.hdr-me{font-size:15px;margin-top:3px}
.hdr-me b{color:var(--canary)}
.hdr-right{display:flex;align-items:center;gap:10px}
.hdr-count{font-size:13px;color:var(--muted)}
.icon-btn{background:var(--pitch2);border:1px solid var(--line);color:var(--muted);
  width:34px;height:34px;border-radius:10px;display:grid;place-items:center;cursor:pointer}
.icon-btn:active{transform:scale(.94)}

.tabs{display:flex;gap:6px;background:var(--pitch2);border:1px solid var(--line);
  padding:5px;border-radius:14px;margin-bottom:16px}
.tab{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;
  background:transparent;border:none;color:var(--muted);font-weight:600;font-size:13px;
  padding:10px 4px;border-radius:10px;cursor:pointer}
.tab.on{background:linear-gradient(180deg,#15351f,#0f2817);color:var(--text);
  box-shadow:inset 0 0 0 1px var(--line2)}

.pane{display:flex;flex-direction:column;gap:14px}
.pane-title{font-family:'Anton',sans-serif;font-weight:400;font-size:24px;letter-spacing:.02em;
  display:flex;align-items:center;gap:9px;margin:2px 0 2px}
.pane-title svg{color:var(--canary)}
.legend{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted);
  background:var(--pitch2);border:1px solid var(--line);padding:10px 12px;border-radius:11px}
.legend svg{color:var(--canary)}

/* ---- ticket (bilhete de bolão) ---- */
.ticket{background:linear-gradient(180deg,var(--paper),var(--paper2));color:var(--ink);
  border-radius:14px;padding:14px 16px 0;position:relative;
  box-shadow:0 14px 30px rgba(0,0,0,.35)}
.ticket.locked{filter:saturate(.85)}
.ticket-top{display:flex;justify-content:space-between;align-items:center}
.ticket-group{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-soft)}
.ticket-when{font-size:12px;font-weight:700;color:var(--ink)}
.status{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  padding:3px 9px;border-radius:999px}
.status.live{background:#ffe3df;color:#c0341d}
.status.done{background:#173322;color:#d6f3e0}

.match{display:flex;align-items:center;justify-content:center;gap:10px;padding:16px 0 14px}
.team{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:64px}
.team .flag{font-size:30px;line-height:1}
.team .code{font-family:'Anton',sans-serif;font-size:18px;letter-spacing:.04em}
.scorebox{display:flex;align-items:center;gap:8px}
.score-in{width:46px;height:54px;text-align:center;font-family:'Anton',sans-serif;font-size:28px;
  color:var(--ink);background:#fbf6e4;border:2px solid var(--ink);border-radius:10px;outline:none;
  box-shadow:inset 0 -3px 0 rgba(23,51,34,.12)}
.score-in:focus{border-color:var(--canary2);background:#fff}
.score-in:disabled{background:#e3d7b3;color:var(--ink-soft);border-color:var(--ink-soft);opacity:.9}
.score-in::placeholder{color:#b9a978}
.x{font-family:'Anton',sans-serif;font-size:18px;color:var(--ink-soft)}

.tear{position:relative;border-top:2px dashed rgba(23,51,34,.28);margin:0 -16px}
.notch{position:absolute;top:-9px;width:18px;height:18px;border-radius:50%;background:var(--pitch)}
.notch.l{left:-9px}.notch.r{right:-9px}

.ticket-foot{display:flex;justify-content:space-between;align-items:center;padding:11px 0 14px;
  font-size:12px;color:var(--ink-soft);font-weight:600}
.venue{display:flex;align-items:center;gap:4px}
.official{color:var(--ink)}
.official b{font-family:'Anton',sans-serif;font-size:15px;letter-spacing:.03em}
.muted-foot{display:flex;align-items:center;gap:5px}

.save-btn{margin-top:4px;background:var(--canary);color:#1a1300;border:none;font-weight:800;
  font-size:16px;padding:15px;border-radius:14px;cursor:pointer;
  box-shadow:0 10px 24px rgba(255,210,0,.22)}
.save-btn:active{transform:translateY(1px)}
.save-btn:disabled{opacity:.6}

/* ---- board / classificação ---- */
.empty{background:var(--pitch2);border:1px dashed var(--line2);border-radius:14px;
  padding:22px 18px;color:var(--muted);font-size:14px;line-height:1.5;text-align:center}
.board{background:var(--pitch2);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.row{display:grid;grid-template-columns:38px 1fr auto 46px;align-items:center;gap:8px;
  padding:13px 14px;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:none}
.row.mine{background:rgba(255,210,0,.06)}
.rank{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;font-weight:800;
  font-size:14px;background:#0a2014;color:var(--muted)}
.rank.r1{background:var(--canary);color:#1a1300}
.rank.r2{background:#c8d3cc;color:#0a2014}
.rank.r3{background:#cf9b63;color:#241300}
.rname{font-weight:600;font-size:15px}
.rname em{color:var(--muted);font-style:normal;font-size:12px}
.rmeta{font-size:11px}
.crav{color:var(--canary);font-weight:700}
.rpts{font-family:'Anton',sans-serif;font-size:22px;text-align:right;color:var(--canary)}

.reveal{background:var(--pitch2);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.reveal-head{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;
  padding-bottom:9px;margin-bottom:6px;border-bottom:1px solid var(--line)}
.reveal-head svg{color:var(--canary)}
.reveal-tag{margin-left:auto;font-size:10px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--muted);font-weight:700}
.reveal-empty{font-size:13px;color:var(--muted);padding:4px 0}
.pick{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:12px;padding:7px 0}
.pk-name{font-size:14px}
.pk-guess{font-family:'Anton',sans-serif;font-size:16px;color:var(--text);letter-spacing:.03em}
.pk-pts{font-size:12px;font-weight:800;padding:3px 9px;border-radius:999px;min-width:42px;text-align:center}
.pk-pts.p2{background:rgba(255,210,0,.16);color:var(--canary)}
.pk-pts.p1{background:rgba(34,180,99,.16);color:var(--grass2)}
.pk-pts.p0{background:rgba(255,255,255,.06);color:var(--muted)}

/* ---- organizador ---- */
.org-gate{text-align:center;background:var(--pitch2);border:1px solid var(--line);border-radius:16px;
  padding:30px 22px;display:flex;flex-direction:column;align-items:center;gap:8px}
.org-gate svg{color:var(--canary)}
.org-sub{color:var(--muted);font-size:13.5px;line-height:1.55;margin:0 0 6px}
.org-sub b{color:var(--text)}
.code-input{display:flex;flex-direction:column;gap:10px;width:100%;max-width:320px;margin-top:4px}
.code-input input{width:100%;min-width:0;background:#071811;border:1px solid var(--line2);color:var(--text);
  padding:13px 14px;border-radius:11px;font-size:16px;outline:none;text-align:center;letter-spacing:.15em}
.code-input input:focus{border-color:var(--canary)}
.code-input button{width:100%;background:var(--canary);color:#1a1300;border:none;font-weight:800;
  padding:13px 18px;border-radius:11px;font-size:15px;cursor:pointer}
.code-input button:disabled{opacity:.4;cursor:not-allowed}
.code-err{color:#ff7a63;font-size:13px;font-weight:600;margin-top:2px}
.org-row{background:var(--pitch2);border:1px solid var(--line);border-radius:14px;padding:14px;
  display:flex;flex-direction:column;gap:12px}
.org-match{display:flex;align-items:center;justify-content:center;gap:10px;font-family:'Anton',sans-serif;
  font-size:16px;letter-spacing:.03em}
.score-in.dark{width:42px;height:46px;font-size:22px;background:#071811;color:var(--text);
  border:2px solid var(--line2);box-shadow:none}
.score-in.dark:focus{border-color:var(--canary)}
.score-in.dark::placeholder{color:var(--muted)}
.org-actions{display:flex;gap:8px;justify-content:center}
.mini-btn{display:flex;align-items:center;gap:6px;background:var(--canary);color:#1a1300;border:none;
  font-weight:800;font-size:13px;padding:9px 16px;border-radius:10px;cursor:pointer}
.mini-btn:disabled{opacity:.4;cursor:not-allowed}
.mini-btn.ghost{background:transparent;color:var(--muted);border:1px solid var(--line2)}

/* ---- toast ---- */
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);
  background:var(--canary);color:#1a1300;font-weight:700;font-size:13.5px;
  padding:12px 18px;border-radius:12px;box-shadow:0 14px 34px rgba(0,0,0,.4);z-index:50;
  max-width:90vw;text-align:center}

@media (max-width:380px){
  .gate-title{font-size:46px}
  .team{min-width:54px}
  .score-in{width:42px}
}
`;
