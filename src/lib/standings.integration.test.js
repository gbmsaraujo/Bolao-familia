/**
 * Teste de integração — standings completo contra Supabase real
 *
 * Simula um bolão finalizado: 3 jogadores, 3 jogos, todos os resultados lançados.
 * Insere dados com prefix "__inttest__" para não colidir com dados reais.
 * Limpa tudo no afterAll.
 *
 * Rodar com: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { calcStandings } from "./scoring.js";

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
const SUPABASE_URL = "https://sienpclfcolpnaelixil.supabase.co/";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpZW5wY2xmY29scG5hZWxpeGlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMDU0MDAsImV4cCI6MjA5Njg4MTQwMH0.6UV3wp47tww6vas7Wr2hDUfuIs8KktH6ZXOvcENjmWY";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Prefixo que identifica dados de teste — jamais colide com pred: ou results reais
const P = "__inttest__";

// ---------------------------------------------------------------------------
// Dados do cenário completo (3 jogos encerrados)
// ---------------------------------------------------------------------------
const GAMES = [
  { id: "g1" }, // Brasil 2-0 Marrocos
  { id: "g2" }, // Brasil 2-0 Haiti
  { id: "g3" }, // Escócia 1-0 Brasil
];

const RESULTS = {
  g1: { h: 2, a: 0 },
  g2: { h: 2, a: 0 },
  g3: { h: 1, a: 0 },
  classified: ["BRA", "MAR"],
  brazilGoals: 7,
  scorers: {
    g1: ["Vinícius Jr.", "Rodrygo"],
    g2: ["Endrick"],
    g3: [],
  },
};

// Gabriel → 16 pts, 2 cravadas
// g1: exato +3, scorer Vini+Rodrygo +2 = 5
// g2: resultado +2, scorer Endrick +1 = 3
// g3: exato +3, scorer vazio = 3
// classified exato +3, brazilGoals exato +2
// Total: 5+3+3+3+2 = 16
const GABRIEL = {
  id: "p_gabriel", name: "Gabriel",
  scores: { g1: { h: 2, a: 0 }, g2: { h: 3, a: 1 }, g3: { h: 1, a: 0 } },
  classified: ["BRA", "MAR"],
  brazilGoals: 7,
  scorers: { g1: ["Vinícius Jr.", "Rodrygo", ""], g2: ["Endrick", "", ""], g3: ["", "", ""] },
  updatedAt: Date.now(),
};

// Bia → 7 pts, 1 cravada
// g1: resultado +2, scorer Vini (sem acento aceito) +1 = 3
// g2: exato +3, scorer Fred miss = 3
// g3: errou = 0
// classified errou, brazilGoals off-by-1 +1
// Total: 3+3+0+0+1 = 7
const BIA = {
  id: "p_bia", name: "Bia",
  scores: { g1: { h: 1, a: 0 }, g2: { h: 2, a: 0 }, g3: { h: 0, a: 1 } },
  classified: ["BRA", "HAI"],
  brazilGoals: 6,
  scorers: { g1: ["Vinicius Jr.", "", ""], g2: ["Fred", "", ""], g3: ["", "", ""] },
  updatedAt: Date.now(),
};

// Tia Sônia → 6 pts, 0 cravadas
// g1: errou = 0 | g2: errou = 0 | g3: resultado +2
// classified ["MAR","BRA"] = ["BRA","MAR"] → +3
// brazilGoals 8 vs 7, off-by-1 → +1
// Total: 0+0+2+3+1 = 6
const TIA_SONIA = {
  id: "p_tia_sonia", name: "Tia Sônia",
  scores: { g1: { h: 0, a: 0 }, g2: { h: 0, a: 0 }, g3: { h: 2, a: 1 } },
  classified: ["MAR", "BRA"],
  brazilGoals: 8,
  scorers: { g1: ["Fred", "Richarlison", ""], g2: ["", "", ""], g3: ["", "", ""] },
  updatedAt: Date.now(),
};

// ---------------------------------------------------------------------------
// Helpers: escrever e ler do Supabase com o prefix de teste
// ---------------------------------------------------------------------------
async function kv_set(key, value) {
  const { error } = await supabase
    .from("kv")
    .upsert({ key: P + key, value: JSON.stringify(value), updated_at: new Date().toISOString() });
  if (error) throw new Error(`kv_set(${key}): ${error.message}`);
}

async function kv_get(key) {
  const { data, error } = await supabase
    .from("kv").select("value").eq("key", P + key).maybeSingle();
  if (error) throw new Error(`kv_get(${key}): ${error.message}`);
  return data ? JSON.parse(data.value) : null;
}

async function cleanup() {
  const { error } = await supabase.from("kv").delete().like("key", `${P}%`);
  if (error) throw new Error(`cleanup: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
let players = [];
let results = {};

beforeAll(async () => {
  // Garante que não há lixo de uma execução anterior
  await cleanup();

  // Insere os 3 jogadores
  await kv_set("pred:gabriel",  GABRIEL);
  await kv_set("pred:bia",      BIA);
  await kv_set("pred:tia_sonia", TIA_SONIA);

  // Insere resultados oficiais
  await kv_set("results", RESULTS);

  // Lê de volta (simula loadAll)
  const g = await kv_get("pred:gabriel");
  const b = await kv_get("pred:bia");
  const ts = await kv_get("pred:tia_sonia");
  results = await kv_get("results");
  players = [g, b, ts];
}, 20_000); // timeout generoso para rede

afterAll(async () => {
  await cleanup();
}, 10_000);

function printStandings(standings) {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║         TABELA FINAL — Bolão da Família Copa 2026    ║");
  console.log("╠═══╦══════════════╦═══════╦══════════╦═══════════════╣");
  console.log("║ # ║ Jogador      ║  Pts  ║ Cravadas ║ Breakdown     ║");
  console.log("╠═══╬══════════════╬═══════╬══════════╬═══════════════╣");
  standings.forEach((p, i) => {
    const pos  = String(i + 1).padStart(2);
    const name = p.name.padEnd(12).slice(0, 12);
    const pts  = String(p.pts).padStart(5);
    const crav = String(p.cravadas).padStart(8);
    console.log(`║ ${pos} ║ ${name} ║ ${pts} ║ ${crav} ║               ║`);
  });
  console.log("╚═══╩══════════════╩═══════╩══════════╩═══════════════╝\n");
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------
describe("integração Supabase — dados persistem e são lidos corretamente", () => {
  it("exibe a tabela de classificação final", () => {
    const standings = calcStandings(players, results, GAMES);
    printStandings(standings);
    expect(standings.length).toBeGreaterThan(0);
  });

  it("leu 3 jogadores do banco", () => {
    expect(players).toHaveLength(3);
    expect(players.every(Boolean)).toBe(true);
  });

  it("dados de Gabriel persistem com fidelidade", () => {
    const g = players.find((p) => p.id === "p_gabriel");
    expect(g.name).toBe("Gabriel");
    expect(g.scores.g1).toEqual({ h: 2, a: 0 });
    expect(g.classified).toEqual(["BRA", "MAR"]);
    expect(g.brazilGoals).toBe(7);
    expect(g.scorers.g1).toEqual(["Vinícius Jr.", "Rodrygo", ""]);
  });

  it("resultados oficiais persistem com fidelidade", () => {
    expect(results.g1).toEqual({ h: 2, a: 0 });
    expect(results.classified).toEqual(["BRA", "MAR"]);
    expect(results.brazilGoals).toBe(7);
    expect(results.scorers.g1).toEqual(["Vinícius Jr.", "Rodrygo"]);
  });
});

describe("integração Supabase — calcStandings com dados reais do banco", () => {
  it("classifica na ordem correta: Gabriel → Bia → Tia Sônia", () => {
    const standings = calcStandings(players, results, GAMES);
    expect(standings.map((r) => r.name)).toEqual(["Gabriel", "Bia", "Tia Sônia"]);
  });

  it("Gabriel totaliza 16 pontos e 2 cravadas", () => {
    const standings = calcStandings(players, results, GAMES);
    const gabriel = standings.find((r) => r.id === "p_gabriel");
    expect(gabriel.pts).toBe(16);
    expect(gabriel.cravadas).toBe(2);
  });

  it("Bia totaliza 7 pontos e 1 cravada", () => {
    const standings = calcStandings(players, results, GAMES);
    const bia = standings.find((r) => r.id === "p_bia");
    expect(bia.pts).toBe(7);
    expect(bia.cravadas).toBe(1);
  });

  it("Tia Sônia totaliza 6 pontos e 0 cravadas", () => {
    const standings = calcStandings(players, results, GAMES);
    const ts = standings.find((r) => r.id === "p_tia_sonia");
    expect(ts.pts).toBe(6);
    expect(ts.cravadas).toBe(0);
  });

  it("Bia recebe ponto por Vinícius Jr. escrito sem acento", () => {
    const standings = calcStandings(players, results, GAMES);
    const bia = standings.find((r) => r.id === "p_bia");
    // Sem o ponto do scorer, Bia teria 6 pts (igual a Tia Sônia)
    // Com o +1 do scorer ela fica com 7 — acima de Tia Sônia
    expect(bia.pts).toBeGreaterThan(standings.find((r) => r.id === "p_tia_sonia").pts);
  });

  it("classificados na ordem invertida ['MAR','BRA'] ainda valem +3", () => {
    const standings = calcStandings(players, results, GAMES);
    const ts = standings.find((r) => r.id === "p_tia_sonia");
    // Tia Sônia palpitou ['MAR','BRA'], oficial é ['BRA','MAR'] — deve valer
    // 6 pts totais contém os +3 de classified + +1 de goals + +2 de g3
    expect(ts.pts).toBe(6);
  });
});
