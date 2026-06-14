export const normStr = (s) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export const isNum = (v) =>
  v !== "" && v !== null && v !== undefined && !Number.isNaN(Number(v));

export const slug = (s) =>
  "p_" +
  s.toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export const toScorerArray = (v) => {
  if (Array.isArray(v)) return [...v, "", "", ""].slice(0, 3).map(String);
  if (typeof v === "string" && v) return [v, "", ""];
  return ["", "", ""];
};

// Converte {bra,opp} (novo formato) ou string[] (legado) em lista plana de nomes não-vazios
export const flattenScorers = (v) => {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return [...(v.bra || []), ...(v.opp || [])].filter(Boolean);
  }
  return toScorerArray(v).filter(Boolean);
};

// Placar exato → +3 | Vitória/derrota certa → +2 | Empate só vale exato | Errou → 0
export function pointsFor(pred, res) {
  if (!pred || !res) return null;
  if (!isNum(pred.h) || !isNum(pred.a) || !isNum(res.h) || !isNum(res.a)) return null;
  const ph = +pred.h, pa = +pred.a, rh = +res.h, ra = +res.a;
  if (ph === rh && pa === ra) return 3;
  if (rh !== ra && Math.sign(ph - pa) === Math.sign(rh - ra)) return 2;
  return 0;
}

// 2 classificados certos (ordem não importa) → +3
export function pointsForClassified(pred, official) {
  if (!pred || !official || pred.length !== 2 || official.length !== 2) return null;
  const predSet = new Set(pred);
  return official.every((code) => predSet.has(code)) ? 3 : 0;
}

// Total de gols Brasil: exato → +2 | ±1 → +1 | resto → 0
export function pointsForBrazilGoals(pred, official) {
  if (!isNum(pred) || !isNum(official)) return null;
  const diff = Math.abs(+pred - +official);
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

// Acertou qualquer goleador da lista → +2 (flat, independente de quantos acertou)
export function pointsForScorer(predArray, officialList) {
  if (!predArray || !officialList || officialList.length === 0) return null;
  const preds = (Array.isArray(predArray) ? predArray : [predArray])
    .filter(Boolean).map(normStr);
  if (preds.length === 0) return null;
  return preds.some((p) => officialList.some((o) => normStr(o) === p)) ? 2 : 0;
}

// Pontua goleadores por equipe: +2 se qualquer pick do Brasil acertou +
//                               +2 se qualquer pick do adversário acertou (máx +4)
// Suporta formato legado (array plano → tratado como picks do Brasil)
export function calcScorerPoints(scorerObj, officialList) {
  if (!officialList || officialList.length === 0) return null;

  let bra, opp;
  if (scorerObj && typeof scorerObj === "object" && !Array.isArray(scorerObj)) {
    bra = (scorerObj.bra || []).filter(Boolean);
    opp = (scorerObj.opp || []).filter(Boolean);
  } else {
    bra = toScorerArray(scorerObj).filter(Boolean);
    opp = [];
  }

  if (bra.length === 0 && opp.length === 0) return null;

  const officials = officialList.map(normStr);
  let pts = 0;
  if (bra.length > 0 && bra.map(normStr).some((p) => officials.includes(p))) pts += 2;
  if (opp.length > 0 && opp.map(normStr).some((p) => officials.includes(p))) pts += 2;
  return pts;
}

export function gameLocked(game, results) {
  const res = results[game.id];
  const finished = !!(res && isNum(res.h) && isNum(res.a));
  const started = Date.now() >= new Date(game.kickoff).getTime();
  return { finished, started, locked: finished || started };
}

export function prevGameFinished(gameIndex, games, results) {
  if (gameIndex === 0) return true;
  const prev = games[gameIndex - 1];
  const r = results[prev.id];
  return !!(r && isNum(r.h) && isNum(r.a));
}

// Calcula a tabela de classificação a partir dos palpites e dos resultados oficiais.
// Retorna cada jogador com `pts`, `cravadas` e `breakdown` por categoria.
export function calcStandings(players, results, games) {
  const rows = players.map((p) => {
    let pts = 0;
    let cravadas = 0;
    const breakdown = { games: {}, classified: null, brazilGoals: null };

    games.forEach((g) => {
      const res = results[g.id];
      if (!res || !isNum(res.h) || !isNum(res.a)) return;

      let gamePts = 0;
      const pr = pointsFor(p.scores?.[g.id], res);
      if (pr !== null) {
        pts += pr;
        gamePts += pr;
        if (pr === 3) cravadas++;
      }

      const officialScorers = results.scorers?.[g.id];
      if (officialScorers) {
        const sp = calcScorerPoints(p.scorers?.[g.id], officialScorers);
        if (sp !== null) { pts += sp; gamePts += sp; }
      }

      breakdown.games[g.id] = gamePts;
    });

    if (results.classified?.length === 2 && p.classified?.length === 2) {
      const cp = pointsForClassified(p.classified, results.classified);
      if (cp !== null) { pts += cp; breakdown.classified = cp; }
    }

    if (isNum(results.brazilGoals) && isNum(p.brazilGoals)) {
      const gp = pointsForBrazilGoals(p.brazilGoals, results.brazilGoals);
      if (gp !== null) { pts += gp; breakdown.brazilGoals = gp; }
    }

    return { ...p, pts, cravadas, breakdown };
  });

  rows.sort((a, b) => b.pts - a.pts || b.cravadas - a.cravadas || a.name.localeCompare(b.name));
  return rows;
}
