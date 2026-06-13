import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Lock, Trophy, Ticket, Settings, Check, Eye, EyeOff, RefreshCw, Crown, Target, Users, Zap, UserCheck, Clock } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ *
 *  BOLÃO DA FAMÍLIA · Brasil na Copa 2026 (Grupo C)
 * ------------------------------------------------------------------ */

const ORG_CODE = "arichan";

const GAMES = [
  {
    id: "g1",
    group: "Grupo C · Rodada 1",
    home: { code: "BRA", name: "Brasil", flag: "🇧🇷" },
    away: { code: "MAR", name: "Marrocos", flag: "🇲🇦" },
    when: "Sáb 13/jun · 19h",
    venue: "Nova York / NJ",
    kickoff: "2026-06-13T22:00:00Z",
  },
  {
    id: "g2",
    group: "Grupo C · Rodada 2",
    home: { code: "BRA", name: "Brasil", flag: "🇧🇷" },
    away: { code: "HAI", name: "Haiti", flag: "🇭🇹" },
    when: "Sex 19/jun · 22h",
    venue: "Filadélfia",
    kickoff: "2026-06-20T01:00:00Z",
  },
  {
    id: "g3",
    group: "Grupo C · Rodada 3",
    home: { code: "ESC", name: "Escócia", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
    away: { code: "BRA", name: "Brasil", flag: "🇧🇷" },
    when: "Qua 24/jun · 19h",
    venue: "Miami",
    kickoff: "2026-06-24T22:00:00Z",
  },
];

const GROUP_TEAMS = [
  { code: "BRA", name: "Brasil", flag: "🇧🇷" },
  { code: "MAR", name: "Marrocos", flag: "🇲🇦" },
  { code: "HAI", name: "Haiti", flag: "🇭🇹" },
  { code: "ESC", name: "Escócia", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
];

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const store = {
  async list(prefix) {
    const { data, error } = await supabase.from("kv").select("key").like("key", `${prefix}%`);
    if (error) { console.error("list", error); return { keys: [] }; }
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
    if (error) { console.error("set", error); return null; }
    return { key, value };
  },
  async del(key) {
    const { error } = await supabase.from("kv").delete().eq("key", key);
    if (error) console.error("del", error);
  },
};

/* ----------------------------- utils ----------------------------- */
const slug = (s) =>
  "p_" +
  s.toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const isNum = (v) => v !== "" && v !== null && v !== undefined && !Number.isNaN(Number(v));

const normStr = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/* ----------------------------- scoring ----------------------------- */
function pointsFor(pred, res) {
  if (!pred || !res) return null;
  if (!isNum(pred.h) || !isNum(pred.a) || !isNum(res.h) || !isNum(res.a)) return null;
  const ph = +pred.h, pa = +pred.a, rh = +res.h, ra = +res.a;
  if (ph === rh && pa === ra) return 3;
  if (Math.sign(ph - pa) === Math.sign(rh - ra)) return 2;
  return 0;
}

function pointsForClassified(pred, official) {
  if (!pred || !official || pred.length !== 2 || official.length !== 2) return null;
  const predSet = new Set(pred);
  return official.every((code) => predSet.has(code)) ? 3 : 0;
}

function pointsForBrazilGoals(pred, official) {
  if (!isNum(pred) || !isNum(official)) return null;
  const diff = Math.abs(+pred - +official);
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

function pointsForScorer(predArray, officialList) {
  // predArray: array of up to 3 player name strings
  // officialList: array of players who actually scored
  if (!predArray || !officialList) return null;
  const preds = (Array.isArray(predArray) ? predArray : [predArray]).filter(Boolean).map(normStr);
  if (preds.length === 0) return null;
  const hits = preds.filter((p) => officialList.some((o) => normStr(o) === p)).length;
  return hits; // 0, 1, 2 or 3
}

const toScorerArray = (v) => {
  if (Array.isArray(v)) return [...v, "", "", ""].slice(0, 3).map(String);
  if (typeof v === "string" && v) return [v, "", ""];
  return ["", "", ""];
};

const gameLocked = (game, results) => {
  const res = results[game.id];
  const finished = res && isNum(res.h) && isNum(res.a);
  const started = Date.now() >= new Date(game.kickoff).getTime();
  return { finished, started, locked: finished || started };
};

// A game is only open for betting after the previous game has an official result
const prevGameFinished = (gameIndex, results) => {
  if (gameIndex === 0) return true;
  const prev = GAMES[gameIndex - 1];
  const r = results[prev.id];
  return r && isNum(r.h) && isNum(r.a);
};

const G1_KICKOFF = new Date(GAMES[0].kickoff).getTime();
const preLockExpired = () => Date.now() >= G1_KICKOFF;

/* ============================== APP ============================== */
export default function App() {
  const [me, setMe] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [tab, setTab] = useState("palpites");
  const [players, setPlayers] = useState([]);
  const [results, setResults] = useState({});
  const [myScores, setMyScores] = useState({});
  const [myClassified, setMyClassified] = useState([]);
  const [myBrazilGoals, setMyBrazilGoals] = useState("");
  const [myScorers, setMyScorers] = useState({ g1: ["", "", ""], g2: ["", "", ""], g3: ["", "", ""] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [orgUnlocked, setOrgUnlocked] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState(null); // null | "pending" | "approved" | "rejected"
  const [tick, setTick] = useState(0);

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
        try { ps.push(JSON.parse(r.value)); } catch {}
      }
    }
    let res = {};
    const rr = await store.get("results");
    if (rr && rr.value) {
      try { res = JSON.parse(rr.value); } catch {}
    }
    setPlayers(ps);
    setResults(res);
    setLoading(false);
    return { ps, res };
  }, []);

  const loginAs = useCallback((id, name, ps) => {
    const mine = ps.find((p) => p.id === id);
    const start = {};
    GAMES.forEach((g) => {
      start[g.id] = mine?.scores?.[g.id] ? { ...mine.scores[g.id] } : { h: "", a: "" };
    });
    setMyScores(start);
    setMyClassified(mine?.classified || []);
    setMyBrazilGoals(mine?.brazilGoals !== undefined ? String(mine.brazilGoals) : "");
    setMyScorers({
      g1: toScorerArray(mine?.scorers?.g1),
      g2: toScorerArray(mine?.scorers?.g2),
      g3: toScorerArray(mine?.scorers?.g3),
    });
    setMe({ id, name: mine?.name || name });
  }, []);

  const resolveApproval = useCallback(async (id, name, ps) => {
    if (ps.some((p) => p.id === id)) {
      // already in the DB → skip approval
      loginAs(id, name, ps);
      setApprovalStatus("approved");
      return;
    }
    const r = await store.get(`approval:${id}`);
    if (r?.value) {
      const data = JSON.parse(r.value);
      setMe({ id, name: data.name || name });
      if (data.status === "approved") {
        loginAs(id, data.name || name, ps);
        setApprovalStatus("approved");
      } else {
        setApprovalStatus(data.status); // "pending" or "rejected"
      }
    }
  }, [loginAs]);

  useEffect(() => {
    loadAll().then(({ ps }) => {
      try {
        const saved = localStorage.getItem("bolao_me");
        if (!saved) return;
        const { id, name } = JSON.parse(saved);
        if (id && name) resolveApproval(id, name, ps);
      } catch {}
    });
  }, [loadAll, resolveApproval]);

  // Poll for approval when pending
  useEffect(() => {
    if (approvalStatus !== "pending" || !me) return;
    const interval = setInterval(async () => {
      const r = await store.get(`approval:${me.id}`);
      if (r?.value) {
        const data = JSON.parse(r.value);
        if (data.status === "approved") {
          clearInterval(interval);
          const { ps } = await loadAll();
          loginAs(me.id, me.name, ps);
          setApprovalStatus("approved");
        }
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [approvalStatus, me, loadAll, loginAs]);

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2400);
  };

  const enterName = async () => {
    const name = nameInput.trim();
    if (name.length < 2) return;
    const id = slug(name);
    const { ps } = await loadAll();

    // Existing player → direct access
    if (ps.some((p) => p.id === id)) {
      loginAs(id, name, ps);
      setApprovalStatus("approved");
      localStorage.setItem("bolao_me", JSON.stringify({ id, name }));
      return;
    }

    // Check existing approval record
    const existing = await store.get(`approval:${id}`);
    if (existing?.value) {
      const data = JSON.parse(existing.value);
      setMe({ id, name: data.name || name });
      localStorage.setItem("bolao_me", JSON.stringify({ id, name: data.name || name }));
      if (data.status === "approved") {
        loginAs(id, data.name || name, ps);
        setApprovalStatus("approved");
      } else {
        setApprovalStatus(data.status);
      }
      return;
    }

    // New user → create approval request
    await store.set(`approval:${id}`, JSON.stringify({ id, name, status: "pending", requestedAt: Date.now() }));
    setMe({ id, name });
    setApprovalStatus("pending");
    localStorage.setItem("bolao_me", JSON.stringify({ id, name }));
  };

  const logout = () => {
    localStorage.removeItem("bolao_me");
    setMe(null);
    setApprovalStatus(null);
    setNameInput("");
  };

  const approveUser = async (id) => {
    const r = await store.get(`approval:${id}`);
    if (!r?.value) return;
    const data = JSON.parse(r.value);
    await store.set(`approval:${id}`, JSON.stringify({ ...data, status: "approved", approvedAt: Date.now() }));
  };

  const rejectUser = async (id) => {
    const r = await store.get(`approval:${id}`);
    if (!r?.value) return;
    const data = JSON.parse(r.value);
    await store.set(`approval:${id}`, JSON.stringify({ ...data, status: "rejected" }));
  };

  const deleteUser = async (id) => {
    await Promise.all([store.del(`pred:${id}`), store.del(`approval:${id}`)]);
    await loadAll();
  };

  const setMyScore = (gid, side, val) => {
    const clean = val.replace(/[^0-9]/g, "").slice(0, 2);
    setMyScores((s) => ({ ...s, [gid]: { ...s[gid], [side]: clean } }));
  };

  const toggleClassified = (code) => {
    if (preLockExpired()) return;
    setMyClassified((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= 2) return prev;
      return [...prev, code];
    });
  };

  const saveMyPicks = async () => {
    if (!me) return;
    setSaving(true);
    const existing = players.find((p) => p.id === me.id) || {};

    const scores = { ...(existing.scores || {}) };
    GAMES.forEach((g, i) => {
      const { locked } = gameLocked(g, results);
      const open = prevGameFinished(i, results);
      const cur = myScores[g.id];
      if (!locked && open && cur && isNum(cur.h) && isNum(cur.a)) {
        scores[g.id] = { h: +cur.h, a: +cur.a };
      }
    });

    const scorers = { ...(existing.scorers || {}) };
    GAMES.forEach((g, i) => {
      const { locked } = gameLocked(g, results);
      const open = prevGameFinished(i, results);
      const arr = myScorers[g.id] || [];
      if (!locked && open && arr.some((s) => s.trim())) {
        scorers[g.id] = arr.map((s) => s.trim());
      }
    });

    const classified = preLockExpired()
      ? (existing.classified || [])
      : myClassified;

    const brazilGoals = preLockExpired()
      ? existing.brazilGoals
      : isNum(myBrazilGoals) ? +myBrazilGoals : undefined;

    const record = {
      id: me.id,
      name: me.name,
      scores,
      classified,
      brazilGoals,
      scorers,
      updatedAt: Date.now(),
    };
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

  const saveOfficialClassified = async (classified) => {
    const next = { ...results, classified };
    setResults(next);
    await store.set("results", JSON.stringify(next));
    flash("Classificados oficiais salvos!");
  };

  const saveOfficialBrazilGoals = async (goals) => {
    const next = { ...results, brazilGoals: +goals };
    setResults(next);
    await store.set("results", JSON.stringify(next));
    flash("Total de gols salvo!");
  };

  const saveOfficialScorer = async (gid, scorerStr) => {
    const scorers = results.scorers ? { ...results.scorers } : {};
    if (scorerStr.trim()) {
      scorers[gid] = scorerStr.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      delete scorers[gid];
    }
    const next = { ...results, scorers };
    setResults(next);
    await store.set("results", JSON.stringify(next));
    flash("Goleadores salvos!");
  };

  /* standings */
  const standings = useMemo(() => {
    const rows = players.map((p) => {
      let pts = 0;
      let cravadas = 0;

      GAMES.forEach((g) => {
        const res = results[g.id];
        if (!res || !isNum(res.h) || !isNum(res.a)) return;

        const pr = pointsFor(p.scores?.[g.id], res);
        if (pr !== null) {
          pts += pr;
          if (pr === 3) cravadas++;
        }

        const officialScorers = results.scorers?.[g.id];
        if (officialScorers) {
          const sp = pointsForScorer(p.scorers?.[g.id], officialScorers);
          if (sp !== null) pts += sp;
        }
      });

      if (results.classified?.length === 2 && p.classified?.length === 2) {
        const cp = pointsForClassified(p.classified, results.classified);
        if (cp !== null) pts += cp;
      }

      if (isNum(results.brazilGoals) && isNum(p.brazilGoals)) {
        const gp = pointsForBrazilGoals(p.brazilGoals, results.brazilGoals);
        if (gp !== null) pts += gp;
      }

      return { ...p, pts, cravadas };
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
      ) : approvalStatus === "pending" ? (
        <WaitingApproval name={me.name} onLogout={logout} />
      ) : approvalStatus === "rejected" ? (
        <RejectedScreen name={me.name} onLogout={logout} />
      ) : approvalStatus === "approved" ? (
        <div className="shell">
          <Header me={me} count={players.length} onRefresh={loadAll} onLogout={logout} />

          <nav className="tabs">
            <button className={tab === "palpites" ? "tab on" : "tab"} onClick={() => setTab("palpites")}>
              <Ticket size={16} /> Palpites
            </button>
            <button
              className={tab === "tabela" ? "tab on" : "tab"}
              onClick={() => { loadAll(); setTab("tabela"); }}
            >
              <Trophy size={16} /> Classificação
            </button>
            <button className={tab === "org" ? "tab on" : "tab"} onClick={() => setTab("org")}>
              <Settings size={16} /> Placares
            </button>
            <button className={tab === "aprovacoes" ? "tab on" : "tab"} onClick={() => setTab("aprovacoes")}>
              <UserCheck size={16} />
            </button>
          </nav>

          {tab === "palpites" && (
            <Palpites
              myScores={myScores}
              setMyScore={setMyScore}
              myClassified={myClassified}
              toggleClassified={toggleClassified}
              myBrazilGoals={myBrazilGoals}
              setMyBrazilGoals={setMyBrazilGoals}
              myScorers={myScorers}
              setMyScorers={setMyScorers}
              results={results}
              players={players}
              me={me}
              onSave={saveMyPicks}
              saving={saving}
              tick={tick}
            />
          )}

          {tab === "tabela" && (
            <Tabela standings={standings} finishedGames={finishedGames} players={players} results={results} me={me} />
          )}

          {tab === "org" && (
            <Organizador
              results={results}
              onSave={saveResult}
              onSaveClassified={saveOfficialClassified}
              onSaveBrazilGoals={saveOfficialBrazilGoals}
              onSaveScorer={saveOfficialScorer}
              unlocked={orgUnlocked}
              setUnlocked={setOrgUnlocked}
            />
          )}

          {tab === "aprovacoes" && (
            <Aprovacoes
              unlocked={orgUnlocked}
              setUnlocked={setOrgUnlocked}
              onApprove={approveUser}
              onReject={rejectUser}
              onDelete={deleteUser}
            />
          )}
        </div>
      ) : (
        <div className="gate"><div className="gate-card" style={{textAlign:"center",padding:"40px 24px"}}>
          <div className="eyebrow">Bolão da Família</div>
          <p style={{color:"var(--muted)",marginTop:"16px"}}>Carregando…</p>
        </div></div>
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
          Palpite nos 3 jogos do Brasil, escolha os 3 classificados, o goleador e mais. Cada aposta fica <b>secreta</b> até o apito inicial.
        </p>
        <div className="rules-row">
          <span className="pill gold">Cravou placar · +3</span>
          <span className="pill grass">Acertou resultado · +2</span>
          <span className="pill blue">2 classificados · +3</span>
          <span className="pill orange">3 goleadores/jogo · +1/+2/+3</span>
          <span className="pill purple">Total gols Brasil · +2/+1</span>
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
function Header({ me, count, onRefresh, onLogout }) {
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
        <button className="icon-btn logout-btn" onClick={onLogout} title="Trocar usuário">
          ↩
        </button>
      </div>
    </header>
  );
}

/* --------------------------- Palpites tab --------------------------- */
function Palpites({ myScores, setMyScore, myClassified, toggleClassified, myBrazilGoals, setMyBrazilGoals, myScorers, setMyScorers, results, players, me, onSave, saving, tick }) {
  const locked1 = Date.now() >= G1_KICKOFF;

  return (
    <div className="pane">
      <div className="legend">
        <EyeOff size={14} /> Só você vê seus palpites. Eles travam no horário do jogo.
      </div>

      {/* === Participantes === */}
      <div className="participants-card">
        <div className="participants-head">
          <Users size={14} />
          <span>{players.length} {players.length === 1 ? "participante" : "participantes"} no bolão</span>
        </div>
        <div className="participants-list">
          {players.length === 0 ? (
            <span className="participants-empty">Ninguém salvou palpites ainda</span>
          ) : (
            players.map((p) => (
              <span key={p.id} className={"participant-chip" + (p.id === me.id ? " mine" : "")}>
                {p.name}{p.id === me.id ? " 👤" : ""}
              </span>
            ))
          )}
        </div>
      </div>

      {/* === 2 Classificados === */}
      <div className={"bonus-card" + (locked1 ? " locked" : "")}>
        <div className="bonus-head">
          <Users size={15} />
          <span>2 Classificados do Grupo C</span>
          <span className="bonus-pts">+3 pts</span>
          {locked1 && <span className="status done" style={{ marginLeft: "auto" }}>Travado</span>}
        </div>
        <p className="bonus-sub">Quais 2 times vão avançar? (ordem não importa · bloqueia no 1° jogo)</p>
        <div className="team-chips">
          {GROUP_TEAMS.map((t) => {
            const selected = myClassified.includes(t.code);
            const atLimit = myClassified.length >= 2;
            return (
              <button
                key={t.code}
                className={"team-chip" + (selected ? " selected" : "") + (!selected && atLimit ? " dim" : "")}
                onClick={() => toggleClassified(t.code)}
                disabled={locked1 || (!selected && atLimit)}
                type="button"
              >
                {t.flag} {t.name}
                {selected && <Check size={12} />}
              </button>
            );
          })}
        </div>
        {myClassified.length > 0 && (
          <div className="bonus-sel">
            {myClassified.map((c) => GROUP_TEAMS.find((t) => t.code === c)?.flag + " " + c).join(" · ")}
            {myClassified.length < 2 && !locked1 && (
              <span className="muted"> — selecione {2 - myClassified.length} mais</span>
            )}
          </div>
        )}
        {myClassified.length === 0 && locked1 && (
          <div className="bonus-sel muted">nenhum palpite registrado</div>
        )}
      </div>

      {/* === Total de Gols Brasil === */}
      <div className={"bonus-card" + (locked1 ? " locked" : "")}>
        <div className="bonus-head">
          <Target size={15} />
          <span>Total de gols do Brasil na fase de grupos</span>
          <span className="bonus-pts">+2 exato · +1 perto</span>
          {locked1 && <span className="status done" style={{ marginLeft: "auto" }}>Travado</span>}
        </div>
        <p className="bonus-sub">Quantos gols o Brasil vai marcar nos 3 jogos? (bloqueia no 1° jogo)</p>
        <div className="goals-row">
          {locked1 ? (
            <div className="goals-locked">
              <span className="goals-num">{myBrazilGoals !== "" ? myBrazilGoals : "—"}</span>
              <span className="goals-label">gols</span>
            </div>
          ) : (
            <>
              <input
                inputMode="numeric"
                value={myBrazilGoals}
                onChange={(e) => setMyBrazilGoals(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                placeholder="–"
                className="score-in"
                maxLength={2}
              />
              {myBrazilGoals !== "" && (
                <span className="goals-label">gols</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* === Game cards === */}
      {GAMES.map((g, gi) => {
        const { finished, started, locked } = gameLocked(g, results);
        const prevDone = prevGameFinished(gi, results);
        const unavailable = !prevDone && !locked; // previous game not done yet
        const effectiveLocked = locked || unavailable;
        const res = results[g.id];
        const cur = myScores[g.id] || { h: "", a: "" };
        const others = players.filter((p) => p.id !== me.id && p.scores?.[g.id]).length;
        const officialScorers = results.scorers?.[g.id] || [];
        const myScorer = toScorerArray(myScorers[g.id]);
        const scorerResult = finished && officialScorers.length > 0
          ? pointsForScorer(myScorer, officialScorers)
          : null;

        return (
          <div className={"ticket" + (effectiveLocked ? " locked" : "") + (unavailable ? " unavailable" : "")} key={g.id}>
            <div className="ticket-top">
              <span className="ticket-group">{g.group}</span>
              {unavailable ? (
                <span className="status waiting">Aguardando rodada anterior</span>
              ) : locked ? (
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
                  disabled={effectiveLocked}
                  onChange={(e) => setMyScore(g.id, "h", e.target.value)}
                  placeholder="–"
                  aria-label={`gols ${g.home.name}`}
                />
                <span className="x">×</span>
                <input
                  className="score-in"
                  inputMode="numeric"
                  value={cur.a}
                  disabled={effectiveLocked}
                  onChange={(e) => setMyScore(g.id, "a", e.target.value)}
                  placeholder="–"
                  aria-label={`gols ${g.away.name}`}
                />
              </div>
              <Team t={g.away} right />
            </div>

            {/* Scorers (3 players) */}
            <div className="scorer-section">
              <div className="scorer-section-head">
                <Zap size={13} className="scorer-icon" />
                <span className="scorer-label">Quem vai marcar gol?</span>
                {!effectiveLocked && <span className="scorer-pts-badge">+1 · +2 · +3</span>}
                {scorerResult !== null && (
                  <span className={"scorer-badge " + (scorerResult > 0 ? "hit" : "miss")}>
                    {scorerResult > 0 ? `+${scorerResult}` : "0"}
                  </span>
                )}
              </div>
              <div className="scorer-inputs">
                {[0, 1, 2].map((idx) => (
                  effectiveLocked ? (
                    <span key={idx} className={"scorer-chip" + (
                      scorerResult !== null && myScorer[idx] && officialScorers.some(o => normStr(o) === normStr(myScorer[idx]))
                        ? " hit" : (myScorer[idx] ? " miss" : " empty")
                    )}>
                      {unavailable ? "—" : myScorer[idx] || "—"}
                    </span>
                  ) : (
                    <input
                      key={idx}
                      className="scorer-input"
                      type="text"
                      value={myScorer[idx] || ""}
                      onChange={(e) => setMyScorers((s) => ({
                        ...s,
                        [g.id]: s[g.id].map((v, i) => i === idx ? e.target.value : v),
                      }))}
                      placeholder={`Jogador ${idx + 1}`}
                      maxLength={40}
                    />
                  )
                ))}
              </div>
            </div>

            <div className="tear">
              <span className="notch l" />
              <span className="notch r" />
            </div>

            <div className="ticket-foot">
              <span className="venue">📍 {g.venue}</span>
              {unavailable ? (
                <span className="muted-foot">
                  <Lock size={12} /> disponível após a rodada anterior
                </span>
              ) : locked ? (
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
              <span className={"rank r" + Math.min(i + 1, 4)}>
                {i === 0 ? <Crown size={15} /> : i + 1}
              </span>
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
        const officialScorers = results.scorers?.[g.id] || [];

        const picks = players
          .filter((p) => p.scores?.[g.id])
          .map((p) => {
            const scorerArr = toScorerArray(p.scorers?.[g.id]);
            return {
              id: p.id,
              name: p.name,
              score: p.scores[g.id],
              pts: finished ? pointsFor(p.scores[g.id], res) : null,
              scorerArr,
              scorerPts: (finished && officialScorers.length > 0)
                ? pointsForScorer(scorerArr, officialScorers)
                : null,
            };
          })
          .sort((a, b) => {
            const ta = (a.pts ?? 0) + (a.scorerPts ?? 0);
            const tb = (b.pts ?? 0) + (b.scorerPts ?? 0);
            return tb - ta || a.name.localeCompare(b.name);
          });

        return (
          <div className="reveal" key={g.id}>
            <div className="reveal-head">
              <Eye size={14} />
              <span>
                {g.home.flag} {g.home.code} {finished ? `${res.h}–${res.a}` : "×"} {g.away.code} {g.away.flag}
              </span>
              <span className="reveal-tag">{finished ? "revelado" : "aguardando placar"}</span>
            </div>
            {officialScorers.length > 0 && (
              <div className="reveal-extra">
                <Zap size={12} /> Goleadores: <b>{officialScorers.join(", ")}</b>
              </div>
            )}
            {picks.length === 0 ? (
              <div className="reveal-empty">ninguém palpitou neste jogo</div>
            ) : (
              picks.map((pk) => (
                <div className="pick" key={pk.id}>
                  <div className="pk-info">
                    <span className="pk-name">{pk.name}</span>
                    {pk.scorerArr.some(Boolean) && (
                      <span className="pk-scorer">
                        <Zap size={11} />
                        {pk.scorerArr.filter(Boolean).map((s, i) => {
                          const hit = finished && officialScorers.some(o => normStr(o) === normStr(s));
                          return (
                            <span key={i} className={"pk-scorer-name " + (finished ? (hit ? "hit" : "miss") : "")}>
                              {s}
                            </span>
                          );
                        })}
                        {pk.scorerPts !== null && (
                          <span className={"pk-scorer-badge " + (pk.scorerPts > 0 ? "hit" : "miss")}>
                            {pk.scorerPts > 0 ? `+${pk.scorerPts}` : "0"}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <span className="pk-guess">{pk.score.h}–{pk.score.a}</span>
                  {finished && (
                    <span className={"pk-pts p" + pk.pts}>
                      {pk.pts === 3 ? "+3 ⚡" : pk.pts === 2 ? "+2" : "0"}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        );
      })}

      {/* Classified reveal */}
      {results.classified?.length === 2 && (
        <div className="reveal">
          <div className="reveal-head">
            <Users size={14} />
            <span>2 Classificados do Grupo C</span>
            <span className="reveal-tag">revelado</span>
          </div>
          <div className="reveal-extra">
            Classificados oficiais:{" "}
            <b>{results.classified.map((c) => GROUP_TEAMS.find((t) => t.code === c)?.flag + " " + c).join(" · ")}</b>
          </div>
          {players
            .filter((p) => p.classified?.length === 2)
            .map((p) => {
              const cp = pointsForClassified(p.classified, results.classified);
              return (
                <div className="pick" key={p.id}>
                  <div className="pk-info">
                    <span className="pk-name">{p.name}</span>
                    <span className="pk-scorer">
                      {p.classified.map((c) => GROUP_TEAMS.find((t) => t.code === c)?.flag + " " + c).join(" · ")}
                    </span>
                  </div>
                  <span className={"pk-pts p" + (cp ?? 0)}>
                    {cp === 3 ? "+3 ⚡" : "0"}
                  </span>
                </div>
              );
            })}
        </div>
      )}

      {/* Brazil goals reveal */}
      {isNum(results.brazilGoals) && (
        <div className="reveal">
          <div className="reveal-head">
            <Target size={14} />
            <span>Total de gols do Brasil</span>
            <span className="reveal-tag">revelado</span>
          </div>
          <div className="reveal-extra">
            Total oficial: <b>{results.brazilGoals} gols</b>
          </div>
          {players
            .filter((p) => isNum(p.brazilGoals))
            .sort((a, b) => {
              const ap = pointsForBrazilGoals(a.brazilGoals, results.brazilGoals) ?? -1;
              const bp = pointsForBrazilGoals(b.brazilGoals, results.brazilGoals) ?? -1;
              return bp - ap || a.name.localeCompare(b.name);
            })
            .map((p) => {
              const gp = pointsForBrazilGoals(p.brazilGoals, results.brazilGoals);
              return (
                <div className="pick" key={p.id}>
                  <span className="pk-name">{p.name}</span>
                  <span className="pk-guess">{p.brazilGoals} gols</span>
                  <span className={"pk-pts p" + (gp ?? 0)}>
                    {gp > 0 ? `+${gp}` : "0"}
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Organizador --------------------------- */
function Organizador({ results, onSave, onSaveClassified, onSaveBrazilGoals, onSaveScorer, unlocked, setUnlocked }) {
  const [draft, setDraft] = useState(() => {
    const d = {};
    GAMES.forEach((g) => {
      d[g.id] = results[g.id]
        ? { h: String(results[g.id].h), a: String(results[g.id].a) }
        : { h: "", a: "" };
    });
    return d;
  });

  const [draftClassified, setDraftClassified] = useState(results.classified || []);
  const [draftBrazilGoals, setDraftBrazilGoals] = useState(
    isNum(results.brazilGoals) ? String(results.brazilGoals) : ""
  );
  const [draftScorers, setDraftScorers] = useState(() => {
    const s = {};
    GAMES.forEach((g) => {
      s[g.id] = results.scorers?.[g.id]?.join(", ") || "";
    });
    return s;
  });

  const [code, setCode] = useState("");
  const [err, setErr] = useState(false);

  const upd = (gid, side, val) =>
    setDraft((s) => ({ ...s, [gid]: { ...s[gid], [side]: val.replace(/[^0-9]/g, "").slice(0, 2) } }));

  const toggleOfficialClassified = (code) => {
    setDraftClassified((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= 2) return prev;
      return [...prev, code];
    });
  };

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
            Só <b>você</b> lança os resultados oficiais. Ao lançar, os palpites de todo mundo são revelados e a tabela é
            atualizada. Digite o código de organizador para abrir.
          </p>
          <div className="code-input">
            <input
              type="password"
              value={code}
              onChange={(e) => { setCode(e.target.value); setErr(false); }}
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
        <Settings size={18} /> Resultados oficiais
      </h2>
      <p className="org-sub">Lance os resultados após cada jogo para revelar os palpites e somar os pontos.</p>

      {/* Scores + scorers per game */}
      {GAMES.map((g) => {
        const saved = results[g.id];
        const d = draft[g.id];
        return (
          <div className="org-row" key={g.id}>
            <div className="org-game-label">{g.group} · {g.when}</div>

            <div className="org-match">
              <span>{g.home.flag} {g.home.code}</span>
              <input
                className="score-in dark"
                inputMode="numeric"
                value={d.h}
                onChange={(e) => upd(g.id, "h", e.target.value)}
                placeholder="–"
              />
              <span className="x">×</span>
              <input
                className="score-in dark"
                inputMode="numeric"
                value={d.a}
                onChange={(e) => upd(g.id, "a", e.target.value)}
                placeholder="–"
              />
              <span>{g.away.code} {g.away.flag}</span>
            </div>
            <div className="org-actions">
              <button
                className="mini-btn"
                disabled={!isNum(d.h) || !isNum(d.a)}
                onClick={() => onSave(g.id, d.h, d.a)}
              >
                <Check size={14} /> {saved ? "Atualizar" : "Lançar"}
              </button>
              {saved && (
                <button
                  className="mini-btn ghost"
                  onClick={() => { upd(g.id, "h", ""); upd(g.id, "a", ""); onSave(g.id, "", ""); }}
                >
                  Limpar
                </button>
              )}
            </div>

            <div className="org-scorer-section">
              <label className="org-scorer-label">
                <Zap size={12} /> Goleadores (separar por vírgula se mais de um)
              </label>
              <div className="org-scorer-row">
                <input
                  className="scorer-input"
                  type="text"
                  value={draftScorers[g.id] || ""}
                  onChange={(e) => setDraftScorers((s) => ({ ...s, [g.id]: e.target.value }))}
                  placeholder="Ex.: Vinícius Jr., Rodrygo"
                  style={{ flex: 1 }}
                />
                <button
                  className="mini-btn"
                  onClick={() => onSaveScorer(g.id, draftScorers[g.id] || "")}
                >
                  <Check size={14} /> Salvar
                </button>
              </div>
              {results.scorers?.[g.id]?.length > 0 && (
                <div className="org-saved-info">
                  Salvo: {results.scorers[g.id].join(", ")}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Classified */}
      <div className="org-row">
        <div className="org-game-label">
          <Users size={13} style={{ display: "inline", verticalAlign: "middle" }} /> 2 Times classificados do Grupo C
        </div>
        <div className="team-chips">
          {GROUP_TEAMS.map((t) => {
            const selected = draftClassified.includes(t.code);
            const atLimit = draftClassified.length >= 2;
            return (
              <button
                key={t.code}
                className={"team-chip" + (selected ? " selected" : "") + (!selected && atLimit ? " dim" : "")}
                onClick={() => toggleOfficialClassified(t.code)}
                disabled={!selected && atLimit}
                type="button"
              >
                {t.flag} {t.name}
                {selected && <Check size={12} />}
              </button>
            );
          })}
        </div>
        <div className="org-actions">
          <button
            className="mini-btn"
            disabled={draftClassified.length !== 2}
            onClick={() => onSaveClassified(draftClassified)}
          >
            <Check size={14} /> {results.classified?.length === 2 ? "Atualizar" : "Lançar"}
          </button>
        </div>
        {results.classified?.length === 3 && (
          <div className="org-saved-info">
            Salvo: {results.classified.map((c) => GROUP_TEAMS.find((t) => t.code === c)?.flag + " " + c).join(" · ")}
          </div>
        )}
      </div>

      {/* Brazil total goals */}
      <div className="org-row">
        <div className="org-game-label">
          <Target size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Total de gols do Brasil na fase de grupos
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "center" }}>
          <input
            className="score-in dark"
            inputMode="numeric"
            value={draftBrazilGoals}
            onChange={(e) => setDraftBrazilGoals(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
            placeholder="–"
          />
          <span style={{ color: "var(--muted)", fontSize: "14px" }}>gols</span>
        </div>
        <div className="org-actions">
          <button
            className="mini-btn"
            disabled={!isNum(draftBrazilGoals)}
            onClick={() => onSaveBrazilGoals(draftBrazilGoals)}
          >
            <Check size={14} /> {isNum(results.brazilGoals) ? "Atualizar" : "Lançar"}
          </button>
        </div>
        {isNum(results.brazilGoals) && (
          <div className="org-saved-info">Salvo: {results.brazilGoals} gols</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------- WaitingApproval ------------------------- */
function WaitingApproval({ name, onLogout }) {
  return (
    <div className="gate">
      <div className="gate-card" style={{ textAlign: "center" }}>
        <div className="eyebrow">Copa 2026 · Grupo C</div>
        <h1 className="gate-title" style={{ fontSize: "38px", marginBottom: "20px" }}>
          BOLÃO DA<br />FAMÍLIA
        </h1>
        <div className="waiting-icon"><Clock size={40} /></div>
        <h2 className="waiting-title">Aguardando Aprovação</h2>
        <p className="waiting-sub">
          Olá, <b>{name}</b>! Seu pedido de entrada foi enviado.<br />
          O administrador vai te aprovar em breve. A página verifica automaticamente a cada poucos segundos.
        </p>
        <div className="waiting-pulse">
          <span /><span /><span />
        </div>
        <button className="waiting-back" onClick={onLogout}>
          Voltar / Trocar nome
        </button>
      </div>
    </div>
  );
}

/* ------------------------- RejectedScreen -------------------------- */
function RejectedScreen({ name, onLogout }) {
  return (
    <div className="gate">
      <div className="gate-card" style={{ textAlign: "center" }}>
        <div className="eyebrow">Copa 2026 · Grupo C</div>
        <h1 className="gate-title" style={{ fontSize: "38px", marginBottom: "20px" }}>
          BOLÃO DA<br />FAMÍLIA
        </h1>
        <p className="waiting-sub" style={{ color: "#ff7a63" }}>
          O pedido de <b>{name}</b> não foi aprovado.<br />
          Fala com o organizador se achar que houve engano.
        </p>
        <button className="waiting-back" onClick={onLogout}>
          Tentar com outro nome
        </button>
      </div>
    </div>
  );
}

/* --------------------------- Aprovações ---------------------------- */
function Aprovacoes({ unlocked, setUnlocked, onApprove, onReject, onDelete }) {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState(false);

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    const { keys } = await store.list("approval:");
    const list = [];
    for (const k of keys) {
      const r = await store.get(k);
      if (r?.value) {
        try { list.push(JSON.parse(r.value)); } catch {}
      }
    }
    list.sort((a, b) => (a.requestedAt || 0) - (b.requestedAt || 0));
    setApprovals(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (unlocked) loadApprovals();
  }, [unlocked, loadApprovals]);

  const handle = async (fn, id) => {
    await fn(id);
    await loadApprovals();
  };

  const tryUnlock = () => {
    if (code.trim().toLowerCase() === ORG_CODE) { setErr(false); setUnlocked(true); }
    else setErr(true);
  };

  if (!unlocked) {
    return (
      <div className="pane">
        <div className="org-gate">
          <Lock size={26} />
          <h2 className="pane-title">Aprovações</h2>
          <p className="org-sub">Digite o código de administrador para gerenciar os pedidos de entrada.</p>
          <div className="code-input">
            <input
              type="password"
              value={code}
              onChange={(e) => { setCode(e.target.value); setErr(false); }}
              onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
              placeholder="Código de organizador"
              autoComplete="off"
            />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={tryUnlock} disabled={!code.trim()}>
              Entrar
            </button>
          </div>
          {err && <div className="code-err">Código incorreto.</div>}
        </div>
      </div>
    );
  }

  const pending = approvals.filter((a) => a.status === "pending");
  const approved = approvals.filter((a) => a.status === "approved");
  const rejected = approvals.filter((a) => a.status === "rejected");

  return (
    <div className="pane">
      <h2 className="pane-title">
        <UserCheck size={18} /> Aprovações
      </h2>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="mini-btn ghost" onClick={loadApprovals} disabled={loading}>
          <RefreshCw size={13} /> {loading ? "Carregando…" : "Atualizar"}
        </button>
      </div>

      {/* Pendentes */}
      <div className="aprov-section">
        <div className="aprov-section-title">
          <Clock size={14} /> Aguardando ({pending.length})
        </div>
        {pending.length === 0 ? (
          <div className="aprov-empty">Nenhum pedido pendente</div>
        ) : (
          pending.map((a) => (
            <div className="aprov-row" key={a.id}>
              <div className="aprov-name">
                {a.name}
                <span className="aprov-time">
                  {a.requestedAt ? new Date(a.requestedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
              </div>
              <div className="aprov-actions">
                <button className="mini-btn" onClick={() => handle(onApprove, a.id)}>
                  <Check size={13} /> Aprovar
                </button>
                <button className="mini-btn ghost" onClick={() => handle(onReject, a.id)}>
                  Rejeitar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Aprovados */}
      {approved.length > 0 && (
        <div className="aprov-section">
          <div className="aprov-section-title" style={{ color: "var(--grass2)" }}>
            <Check size={14} /> Aprovados ({approved.length})
          </div>
          {approved.map((a) => (
            <div className="aprov-row" key={a.id}>
              <span className="aprov-name">{a.name}</span>
              <div className="aprov-actions">
                <button className="mini-btn ghost" style={{ fontSize: "11px", padding: "6px 10px" }} onClick={() => handle(onReject, a.id)}>
                  Revogar
                </button>
                <button className="mini-btn delete-btn" style={{ fontSize: "11px", padding: "6px 10px" }}
                  onClick={() => { if (confirm(`Excluir "${a.name}" e todos os palpites? Não dá pra desfazer.`)) handle(onDelete, a.id); }}>
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rejeitados */}
      {rejected.length > 0 && (
        <div className="aprov-section">
          <div className="aprov-section-title" style={{ color: "var(--muted)" }}>
            Rejeitados ({rejected.length})
          </div>
          {rejected.map((a) => (
            <div className="aprov-row" key={a.id}>
              <span className="aprov-name" style={{ color: "var(--muted)" }}>{a.name}</span>
              <div className="aprov-actions">
                <button className="mini-btn ghost" style={{ fontSize: "11px", padding: "6px 10px" }} onClick={() => handle(onApprove, a.id)}>
                  Aprovar
                </button>
                <button className="mini-btn delete-btn" style={{ fontSize: "11px", padding: "6px 10px" }}
                  onClick={() => { if (confirm(`Excluir "${a.name}"?`)) handle(onDelete, a.id); }}>
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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
.rules-row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:22px}
.pill{font-size:11px;font-weight:600;padding:6px 10px;border-radius:999px;border:1px solid var(--line2)}
.pill.gold{color:var(--canary);background:rgba(255,210,0,.08);border-color:rgba(255,210,0,.3)}
.pill.grass{color:var(--grass2);background:rgba(34,180,99,.08);border-color:rgba(34,180,99,.3)}
.pill.blue{color:#7eb8f7;background:rgba(126,184,247,.08);border-color:rgba(126,184,247,.3)}
.pill.orange{color:#ffab5e;background:rgba(255,171,94,.08);border-color:rgba(255,171,94,.3)}
.pill.purple{color:#c4a5f7;background:rgba(196,165,247,.08);border-color:rgba(196,165,247,.3)}
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
  width:34px;height:34px;border-radius:10px;display:grid;place-items:center;cursor:pointer;font-size:16px}
.icon-btn:active{transform:scale(.94)}
.logout-btn{color:var(--muted);font-size:18px}

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

/* ---- participants ---- */
.participants-card{background:var(--pitch2);border:1px solid var(--line);border-radius:12px;
  padding:11px 14px;display:flex;flex-direction:column;gap:9px}
.participants-head{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:var(--muted)}
.participants-head svg{color:var(--canary)}
.participants-list{display:flex;flex-wrap:wrap;gap:6px}
.participants-empty{font-size:12px;color:var(--muted)}
.participant-chip{font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;
  background:rgba(255,255,255,.05);border:1px solid var(--line2);color:var(--text)}
.participant-chip.mine{background:rgba(255,210,0,.1);border-color:rgba(255,210,0,.3);color:var(--canary)}

/* ---- bonus cards (classificados, total gols) ---- */
.bonus-card{background:var(--pitch2);border:1px solid var(--line);border-radius:14px;padding:14px 16px;
  display:flex;flex-direction:column;gap:10px}
.bonus-card.locked{opacity:.5;pointer-events:none;filter:grayscale(.6)}
.bonus-head{display:flex;align-items:center;gap:7px;font-weight:700;font-size:13.5px}
.bonus-head svg{color:var(--canary);flex-shrink:0}
.bonus-pts{margin-left:auto;font-size:11px;font-weight:700;color:var(--canary);
  background:rgba(255,210,0,.1);border:1px solid rgba(255,210,0,.25);
  padding:3px 8px;border-radius:999px;white-space:nowrap}
.bonus-sub{font-size:12px;color:var(--muted);margin:0;line-height:1.4}
.bonus-sel{font-size:12.5px;color:var(--text);font-weight:600;background:rgba(255,255,255,.05);
  border-radius:8px;padding:7px 10px}
.bonus-sel .muted{color:var(--muted);font-weight:400}

/* ---- team chips ---- */
.team-chips{display:flex;flex-wrap:wrap;gap:7px}
.team-chip{display:flex;align-items:center;gap:5px;background:#071811;
  border:1.5px solid var(--line2);color:var(--text);font-size:13px;font-weight:600;
  padding:8px 12px;border-radius:10px;cursor:pointer;transition:border-color .15s,background .15s}
.team-chip:hover:not(:disabled){border-color:var(--canary);background:rgba(255,210,0,.06)}
.team-chip.selected{border-color:var(--canary);background:rgba(255,210,0,.12);color:var(--canary)}
.team-chip.selected svg{color:var(--canary)}
.team-chip.dim{opacity:.4;cursor:not-allowed}
.team-chip:disabled{cursor:not-allowed}

/* ---- goals input ---- */
.goals-row{display:flex;align-items:center;gap:10px;justify-content:center;padding:4px 0}
.goals-locked{display:flex;align-items:center;gap:8px;justify-content:center}
.goals-num{font-family:'Anton',sans-serif;font-size:32px;color:var(--canary);letter-spacing:.02em}
.goals-label{font-size:14px;color:var(--muted);font-weight:600}

/* ---- ticket ---- */
.ticket{background:linear-gradient(180deg,var(--paper),var(--paper2));color:var(--ink);
  border-radius:14px;padding:14px 16px 0;position:relative;
  box-shadow:0 14px 30px rgba(0,0,0,.35)}
.ticket.locked{filter:saturate(.85)}
.ticket.unavailable{filter:saturate(.5);opacity:.7}
.ticket-top{display:flex;justify-content:space-between;align-items:center}
.ticket-group{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-soft)}
.ticket-when{font-size:12px;font-weight:700;color:var(--ink)}
.status{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  padding:3px 9px;border-radius:999px}
.status.live{background:#ffe3df;color:#c0341d}
.status.done{background:#173322;color:#d6f3e0}
.status.waiting{background:rgba(134,162,147,.12);color:var(--muted)}

.match{display:flex;align-items:center;justify-content:center;gap:10px;padding:16px 0 10px}
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

/* ---- scorer section (inside ticket) ---- */
.scorer-section{padding:8px 0 10px;border-top:1px dashed rgba(23,51,34,.18);
  display:flex;flex-direction:column;gap:8px}
.scorer-section-head{display:flex;align-items:center;gap:6px}
.scorer-icon{color:var(--ink-soft);flex-shrink:0}
.scorer-label{font-size:11.5px;font-weight:700;color:var(--ink-soft)}
.scorer-inputs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px}
.scorer-input{min-width:0;background:rgba(255,255,255,.5);border:1.5px solid rgba(23,51,34,.25);
  color:var(--ink);padding:6px 7px;border-radius:8px;font-size:12px;outline:none;width:100%}
.scorer-input:focus{border-color:var(--canary2);background:#fff}
.scorer-input::placeholder{color:rgba(23,51,34,.35);font-size:11px}
.scorer-pts-badge{font-size:11px;font-weight:800;color:var(--canary2);
  background:rgba(231,182,0,.15);border:1px solid rgba(231,182,0,.3);
  padding:3px 7px;border-radius:999px;white-space:nowrap;flex-shrink:0;margin-left:auto}
.scorer-badge{font-size:11px;font-weight:800;padding:2px 7px;border-radius:999px;margin-left:auto}
.scorer-badge.hit{background:rgba(34,180,99,.18);color:#147a41}
.scorer-badge.miss{background:rgba(0,0,0,.08);color:var(--ink-soft)}
.scorer-chip{font-size:12px;font-weight:600;padding:5px 8px;border-radius:8px;text-align:center}
.scorer-chip.hit{background:rgba(34,180,99,.18);color:#147a41}
.scorer-chip.miss{background:rgba(0,0,0,.08);color:var(--ink-soft)}
.scorer-chip.empty{color:rgba(23,51,34,.35)}

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

/* ---- reveal ---- */
.reveal{background:var(--pitch2);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.reveal-head{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;
  padding-bottom:9px;margin-bottom:6px;border-bottom:1px solid var(--line)}
.reveal-head svg{color:var(--canary)}
.reveal-tag{margin-left:auto;font-size:10px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--muted);font-weight:700}
.reveal-extra{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);
  padding:4px 0 8px;border-bottom:1px solid var(--line);margin-bottom:4px}
.reveal-extra svg{color:var(--canary);flex-shrink:0}
.reveal-extra b{color:var(--text)}
.reveal-empty{font-size:13px;color:var(--muted);padding:4px 0}

.pick{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:10px;padding:7px 0;
  border-bottom:1px solid rgba(255,255,255,.04)}
.pick:last-child{border-bottom:none}
.pk-info{display:flex;flex-direction:column;gap:2px;min-width:0}
.pk-name{font-size:14px;font-weight:600}
.pk-scorer{display:flex;align-items:center;flex-wrap:wrap;gap:4px;font-size:11.5px;color:var(--muted)}
.pk-scorer svg{color:var(--canary);flex-shrink:0}
.pk-scorer-name{padding:1px 5px;border-radius:5px;font-size:11px}
.pk-scorer-name.hit{background:rgba(34,180,99,.15);color:var(--grass2);font-weight:700}
.pk-scorer-name.miss{background:rgba(255,255,255,.06);color:var(--muted);text-decoration:line-through}
.pk-scorer-badge{font-size:10px;font-weight:800;padding:2px 6px;border-radius:999px;margin-left:2px}
.pk-scorer-badge.hit{background:rgba(34,180,99,.15);color:var(--grass2)}
.pk-scorer-badge.miss{background:rgba(255,255,255,.06);color:var(--muted)}
.pk-guess{font-family:'Anton',sans-serif;font-size:16px;color:var(--text);letter-spacing:.03em;white-space:nowrap}
.pk-pts{font-size:12px;font-weight:800;padding:3px 9px;border-radius:999px;min-width:42px;text-align:center;white-space:nowrap}
.pk-pts.p3{background:rgba(255,210,0,.16);color:var(--canary)}
.pk-pts.p2{background:rgba(34,180,99,.16);color:var(--grass2)}
.pk-pts.p1{background:rgba(34,180,99,.09);color:var(--grass)}
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
.org-game-label{font-size:12px;font-weight:700;color:var(--muted);letter-spacing:.04em;text-transform:uppercase}
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
.mini-btn.delete-btn{background:rgba(192,52,29,.15);color:#ff7a63;border:1px solid rgba(192,52,29,.3)}

.org-scorer-section{display:flex;flex-direction:column;gap:7px;
  padding-top:10px;border-top:1px solid var(--line)}
.org-scorer-label{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--muted);font-weight:600}
.org-scorer-label svg{color:var(--canary)}
.org-scorer-row{display:flex;gap:8px;align-items:center}
.org-saved-info{font-size:12px;color:var(--grass);font-weight:600}

/* ---- waiting approval ---- */
.waiting-icon{color:var(--canary);margin:8px auto 0;display:flex;justify-content:center}
.waiting-title{font-family:'Anton',sans-serif;font-weight:400;font-size:26px;
  letter-spacing:.02em;margin:12px 0 8px;color:var(--text)}
.waiting-sub{color:var(--muted);font-size:14px;line-height:1.6;margin:0 0 20px}
.waiting-sub b{color:var(--text)}
.waiting-pulse{display:flex;justify-content:center;gap:7px;margin:4px 0 20px}
.waiting-pulse span{width:8px;height:8px;border-radius:50%;background:var(--canary);
  animation:pulse 1.4s ease-in-out infinite}
.waiting-pulse span:nth-child(2){animation-delay:.2s}
.waiting-pulse span:nth-child(3){animation-delay:.4s}
@keyframes pulse{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
.waiting-back{background:transparent;border:1px solid var(--line2);color:var(--muted);
  font-size:13px;font-weight:600;padding:10px 18px;border-radius:10px;cursor:pointer;width:100%}
.waiting-back:hover{border-color:var(--canary);color:var(--text)}

/* ---- aprovações ---- */
.aprov-section{background:var(--pitch2);border:1px solid var(--line);border-radius:14px;
  padding:12px 14px;display:flex;flex-direction:column;gap:2px}
.aprov-section-title{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;
  text-transform:uppercase;letter-spacing:.08em;color:var(--canary);
  padding-bottom:10px;margin-bottom:4px;border-bottom:1px solid var(--line)}
.aprov-empty{font-size:13px;color:var(--muted);padding:6px 0}
.aprov-row{display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.aprov-row:last-child{border-bottom:none}
.aprov-name{font-size:14px;font-weight:600;display:flex;flex-direction:column;gap:2px}
.aprov-time{font-size:11px;color:var(--muted);font-weight:400}
.aprov-actions{display:flex;gap:7px;flex-shrink:0}

/* ---- toast ---- */
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);
  background:var(--canary);color:#1a1300;font-weight:700;font-size:13.5px;
  padding:12px 18px;border-radius:12px;box-shadow:0 14px 34px rgba(0,0,0,.4);z-index:50;
  max-width:90vw;text-align:center}

@media (max-width:380px){
  .gate-title{font-size:46px}
  .team{min-width:54px}
  .score-in{width:42px}
  .team-chip{font-size:12px;padding:7px 10px}
}
`;
