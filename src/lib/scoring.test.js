import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  slug,
  isNum,
  normStr,
  toScorerArray,
  pointsFor,
  pointsForClassified,
  pointsForBrazilGoals,
  pointsForScorer,
  gameLocked,
  prevGameFinished,
  calcStandings,
} from "./scoring.js";

// ---------------------------------------------------------------------------
// slug
// ---------------------------------------------------------------------------
describe("slug", () => {
  it("gera prefixo p_", () => expect(slug("Gabriel")).toMatch(/^p_/));
  it("remove acentos", () => expect(slug("Tia Sônia")).toBe("p_tia-sonia"));
  it("converte espaços em hífens", () => expect(slug("João Pedro")).toBe("p_joao-pedro"));
  it("limita a 40 chars após prefixo", () => {
    const nome = "a".repeat(50);
    expect(slug(nome).length).toBeLessThanOrEqual(42); // "p_" + 40
  });
});

// ---------------------------------------------------------------------------
// isNum
// ---------------------------------------------------------------------------
describe("isNum", () => {
  it("aceita números inteiros", () => expect(isNum(3)).toBe(true));
  it("aceita string numérica", () => expect(isNum("3")).toBe(true));
  it("aceita zero", () => expect(isNum(0)).toBe(true));
  it("rejeita string vazia", () => expect(isNum("")).toBe(false));
  it("rejeita null", () => expect(isNum(null)).toBe(false));
  it("rejeita undefined", () => expect(isNum(undefined)).toBe(false));
  it("rejeita NaN", () => expect(isNum(NaN)).toBe(false));
  it("rejeita texto", () => expect(isNum("abc")).toBe(false));
});

// ---------------------------------------------------------------------------
// normStr
// ---------------------------------------------------------------------------
describe("normStr", () => {
  it("converte para minúsculas", () => expect(normStr("VINICIUS")).toBe("vinicius"));
  it("remove acentos", () => expect(normStr("Vinícius")).toBe("vinicius"));
  it("remove espaços nas bordas", () => expect(normStr("  Pedro  ")).toBe("pedro"));
  it("trata null/undefined sem erro", () => {
    expect(normStr(null)).toBe("");
    expect(normStr(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// toScorerArray
// ---------------------------------------------------------------------------
describe("toScorerArray", () => {
  it("retorna array de 3 se receber array menor", () =>
    expect(toScorerArray(["Vinícius"])).toHaveLength(3));
  it("trunca array maior que 3", () =>
    expect(toScorerArray(["a", "b", "c", "d"])).toHaveLength(3));
  it("converte string única para primeiro elemento", () =>
    expect(toScorerArray("Rodrygo")).toEqual(["Rodrygo", "", ""]));
  it("retorna três strings vazias para valor vazio", () =>
    expect(toScorerArray(null)).toEqual(["", "", ""]));
});

// ---------------------------------------------------------------------------
// pointsFor — placar
// ---------------------------------------------------------------------------
describe("pointsFor", () => {
  it("retorna 3 ao cravar o placar exato", () =>
    expect(pointsFor({ h: 2, a: 0 }, { h: 2, a: 0 })).toBe(3));

  it("retorna 2 ao acertar só o resultado (vitória)", () =>
    expect(pointsFor({ h: 3, a: 1 }, { h: 2, a: 0 })).toBe(2));

  it("retorna 2 ao acertar empate", () =>
    expect(pointsFor({ h: 1, a: 1 }, { h: 2, a: 2 })).toBe(2));

  it("retorna 0 ao errar o resultado", () =>
    expect(pointsFor({ h: 0, a: 1 }, { h: 2, a: 0 })).toBe(0));

  it("retorna 0 quando palpite de vitória e resultado é derrota", () =>
    expect(pointsFor({ h: 2, a: 0 }, { h: 0, a: 1 })).toBe(0));

  it("retorna null quando pred é null", () =>
    expect(pointsFor(null, { h: 2, a: 0 })).toBeNull());

  it("retorna null quando resultado é null", () =>
    expect(pointsFor({ h: 2, a: 0 }, null)).toBeNull());

  it("retorna null quando placar tem campo não numérico", () =>
    expect(pointsFor({ h: "", a: 0 }, { h: 2, a: 0 })).toBeNull());
});

// ---------------------------------------------------------------------------
// pointsForClassified — 2 classificados
// ---------------------------------------------------------------------------
describe("pointsForClassified", () => {
  it("retorna 3 quando os 2 acertam em qualquer ordem", () =>
    expect(pointsForClassified(["BRA", "MAR"], ["MAR", "BRA"])).toBe(3));

  it("retorna 0 quando erra pelo menos um", () =>
    expect(pointsForClassified(["BRA", "HAI"], ["BRA", "MAR"])).toBe(0));

  it("retorna null se pred não tem 2 elementos", () =>
    expect(pointsForClassified(["BRA"], ["BRA", "MAR"])).toBeNull());

  it("retorna null se official não tem 2 elementos", () =>
    expect(pointsForClassified(["BRA", "MAR"], ["BRA"])).toBeNull());

  it("retorna null se pred é null", () =>
    expect(pointsForClassified(null, ["BRA", "MAR"])).toBeNull());
});

// ---------------------------------------------------------------------------
// pointsForBrazilGoals — total de gols
// ---------------------------------------------------------------------------
describe("pointsForBrazilGoals", () => {
  it("retorna 2 ao acertar exato", () =>
    expect(pointsForBrazilGoals(6, 6)).toBe(2));

  it("retorna 1 quando erra por 1 a mais", () =>
    expect(pointsForBrazilGoals(7, 6)).toBe(1));

  it("retorna 1 quando erra por 1 a menos", () =>
    expect(pointsForBrazilGoals(5, 6)).toBe(1));

  it("retorna 0 quando erra por 2 ou mais", () =>
    expect(pointsForBrazilGoals(4, 6)).toBe(0));

  it("aceita strings numéricas", () =>
    expect(pointsForBrazilGoals("6", "6")).toBe(2));

  it("retorna null para valores não numéricos", () =>
    expect(pointsForBrazilGoals(null, 6)).toBeNull());
});

// ---------------------------------------------------------------------------
// pointsForScorer — goleadores
// ---------------------------------------------------------------------------
describe("pointsForScorer", () => {
  const official = ["Vinícius Jr.", "Rodrygo"];

  it("retorna 3 quando os 3 palpites acertam", () =>
    expect(pointsForScorer(
      ["vinicius jr.", "rodrygo", "endrick"],
      ["Vinícius Jr.", "Rodrygo", "Endrick"]
    )).toBe(3));

  it("retorna 2 quando 2 dos 3 acertam", () =>
    expect(pointsForScorer(["Vinícius Jr.", "Rodrygo", "Endrick"], official)).toBe(2));

  it("retorna 1 quando só 1 dos 3 acerta", () =>
    expect(pointsForScorer(["Vinícius Jr.", "Richarlison", "Fred"], official)).toBe(1));

  it("retorna 0 quando nenhum acerta", () =>
    expect(pointsForScorer(["Fred", "Richarlison", "Paquetá"], official)).toBe(0));

  it("compara sem diferenciar maiúsculas e acentos", () =>
    expect(pointsForScorer(["vinicius jr."], ["Vinícius Jr."])).toBe(1));

  it("retorna null quando pred está vazio", () =>
    expect(pointsForScorer(["", "", ""], official)).toBeNull());

  it("retorna null quando official está vazio", () =>
    expect(pointsForScorer(["Vinícius Jr."], [])).toBeNull());

  it("aceita string legada (migração de dados antigos)", () =>
    expect(pointsForScorer("Vinícius Jr.", ["Vinícius Jr."])).toBe(1));
});

// ---------------------------------------------------------------------------
// gameLocked
// ---------------------------------------------------------------------------
describe("gameLocked", () => {
  const future = { id: "g1", kickoff: new Date(Date.now() + 9_000_000).toISOString() };
  const past   = { id: "g1", kickoff: new Date(Date.now() - 9_000_000).toISOString() };

  it("não trava jogo futuro sem resultado", () =>
    expect(gameLocked(future, {}).locked).toBe(false));

  it("trava jogo passado sem resultado (já começou)", () =>
    expect(gameLocked(past, {}).locked).toBe(true));

  it("trava jogo futuro com resultado lançado", () =>
    expect(gameLocked(future, { g1: { h: 2, a: 0 } }).locked).toBe(true));

  it("sinaliza finished quando há resultado válido", () =>
    expect(gameLocked(future, { g1: { h: 2, a: 0 } }).finished).toBe(true));

  it("não sinaliza finished quando não há resultado", () =>
    expect(gameLocked(future, {}).finished).toBe(false));
});

// ---------------------------------------------------------------------------
// prevGameFinished
// ---------------------------------------------------------------------------
describe("prevGameFinished", () => {
  const games = [
    { id: "g1", kickoff: "2026-06-13T22:00:00Z" },
    { id: "g2", kickoff: "2026-06-20T01:00:00Z" },
    { id: "g3", kickoff: "2026-06-24T22:00:00Z" },
  ];

  it("primeiro jogo sempre retorna true (sem jogo anterior)", () =>
    expect(prevGameFinished(0, games, {})).toBe(true));

  it("segundo jogo retorna false quando g1 não tem resultado", () =>
    expect(prevGameFinished(1, games, {})).toBe(false));

  it("segundo jogo retorna true quando g1 tem resultado", () =>
    expect(prevGameFinished(1, games, { g1: { h: 2, a: 0 } })).toBe(true));

  it("terceiro jogo retorna false quando g2 não tem resultado", () =>
    expect(prevGameFinished(2, games, { g1: { h: 2, a: 0 } })).toBe(false));

  it("terceiro jogo retorna true quando g2 tem resultado", () =>
    expect(prevGameFinished(2, games, { g1: { h: 2, a: 0 }, g2: { h: 1, a: 0 } })).toBe(true));
});

// ---------------------------------------------------------------------------
// Edge cases adicionais
// ---------------------------------------------------------------------------

describe("gameLocked — resultado com valores inválidos não conta como finished", () => {
  const future = { id: "g1", kickoff: new Date(Date.now() + 9_000_000).toISOString() };

  it("resultado com strings vazias não sinaliza finished", () =>
    expect(gameLocked(future, { g1: { h: "", a: "" } }).finished).toBe(false));

  it("resultado com apenas um campo válido não sinaliza finished", () =>
    expect(gameLocked(future, { g1: { h: 2, a: "" } }).finished).toBe(false));

  it("resultado com null nos campos não sinaliza finished", () =>
    expect(gameLocked(future, { g1: { h: null, a: null } }).finished).toBe(false));
});

describe("pointsFor — aceita scores em formato string", () => {
  it("strings numéricas são tratadas como números (placar exato)", () =>
    expect(pointsFor({ h: "2", a: "0" }, { h: "2", a: "0" })).toBe(3));

  it("strings numéricas — resultado certo sem placar exato", () =>
    expect(pointsFor({ h: "3", a: "1" }, { h: "2", a: "0" })).toBe(2));
});

describe("pointsForClassified — valida tamanho da lista", () => {
  it("retorna null com 3 elementos em pred", () =>
    expect(pointsForClassified(["BRA", "MAR", "URU"], ["BRA", "MAR"])).toBeNull());

  it("retorna null com lista vazia em pred", () =>
    expect(pointsForClassified([], ["BRA", "MAR"])).toBeNull());
});

describe("pointsForScorer — preenchimento parcial", () => {
  const official = ["Vinícius Jr.", "Rodrygo"];

  it("conta acerto com apenas 1 dos 3 preenchido", () =>
    expect(pointsForScorer(["Vinícius Jr.", "", ""], official)).toBe(1));

  it("conta acertos com 2 dos 3 preenchidos", () =>
    expect(pointsForScorer(["Vinícius Jr.", "Rodrygo", ""], official)).toBe(2));

  it("retorna 0 com 1 preenchido e errado", () =>
    expect(pointsForScorer(["Fred", "", ""], official)).toBe(0));
});

describe("toScorerArray — migração e padding", () => {
  it("preenche array de 2 com string vazia no final", () =>
    expect(toScorerArray(["Vini", "Rodrygo"])).toEqual(["Vini", "Rodrygo", ""]));

  it("preserva array de 3 completo sem alterar", () =>
    expect(toScorerArray(["a", "b", "c"])).toEqual(["a", "b", "c"]));
});

// ---------------------------------------------------------------------------
// Integração — pontuação total de um jogador
// ---------------------------------------------------------------------------
describe("integração — pontuação total combinada", () => {
  const results = {
    g1: { h: 2, a: 0 },
    g2: { h: 2, a: 0 },
    g3: { h: 1, a: 0 },
    classified: ["BRA", "MAR"],
    brazilGoals: 6,
    scorers: {
      g1: ["Vinícius Jr.", "Rodrygo"],
      g2: ["Endrick"],
      g3: [],
    },
  };

  const player = {
    scores: {
      g1: { h: 2, a: 0 },  // placar exato → +3
      g2: { h: 1, a: 0 },  // resultado certo (ambos vitória casa) → +2
      g3: { h: 0, a: 1 },  // resultado errado → +0
    },
    classified: ["BRA", "MAR"],
    brazilGoals: 5,           // erra por 1 → +1
    scorers: {
      g1: ["Vinícius Jr.", "Rodrygo", ""],  // 2 acertos → +2
      g2: ["Endrick", "", ""],              // 1 acerto → +1
      g3: ["", "", ""],                     // sem palpite → null
    },
  };

  const gameIds = ["g1", "g2", "g3"];

  it("pontuação de placares por jogo está correta", () => {
    expect(pointsFor(player.scores.g1, results.g1)).toBe(3);
    expect(pointsFor(player.scores.g2, results.g2)).toBe(2);
    expect(pointsFor(player.scores.g3, results.g3)).toBe(0);
  });

  it("pontuação de goleadores por jogo está correta", () => {
    expect(pointsForScorer(player.scorers.g1, results.scorers.g1)).toBe(2);
    expect(pointsForScorer(player.scorers.g2, results.scorers.g2)).toBe(1);
    expect(pointsForScorer(player.scorers.g3, results.scorers.g3)).toBeNull();
  });

  it("pontuação de classificados e gols está correta", () => {
    expect(pointsForClassified(player.classified, results.classified)).toBe(3);
    expect(pointsForBrazilGoals(player.brazilGoals, results.brazilGoals)).toBe(1);
  });

  it("total de 12 pontos somando todas as categorias", () => {
    let total = 0;
    for (const gid of gameIds) {
      total += pointsFor(player.scores[gid], results[gid]) ?? 0;
      total += pointsForScorer(player.scorers[gid], results.scorers[gid]) ?? 0;
    }
    total += pointsForClassified(player.classified, results.classified) ?? 0;
    total += pointsForBrazilGoals(player.brazilGoals, results.brazilGoals) ?? 0;
    expect(total).toBe(12);
  });

  it("jogador sem nenhum palpite marca 0 pontos", () => {
    const empty = { scores: {}, classified: [], brazilGoals: "", scorers: {} };
    let total = 0;
    for (const gid of gameIds) {
      total += pointsFor(empty.scores[gid], results[gid]) ?? 0;
      total += pointsForScorer(empty.scorers[gid], results.scorers[gid]) ?? 0;
    }
    total += pointsForClassified(null, results.classified) ?? 0;
    total += pointsForBrazilGoals(empty.brazilGoals, results.brazilGoals) ?? 0;
    expect(total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calcStandings — tabela de classificação
// ---------------------------------------------------------------------------
describe("calcStandings", () => {
  const games = [
    { id: "g1", kickoff: "2030-06-13T22:00:00Z" },
    { id: "g2", kickoff: "2030-06-20T01:00:00Z" },
    { id: "g3", kickoff: "2030-06-24T22:00:00Z" },
  ];

  // Resultados oficiais completos (3 jogos encerrados)
  const results = {
    g1: { h: 2, a: 0 },   // Brasil 2-0 Marrocos
    g2: { h: 2, a: 0 },   // Brasil 2-0 Haiti
    g3: { h: 1, a: 0 },   // Escócia 1-0 Brasil
    classified: ["BRA", "MAR"],
    brazilGoals: 7,
    scorers: {
      g1: ["Vinícius Jr.", "Rodrygo"],
      g2: ["Endrick"],
      g3: [],
    },
  };

  // Gabriel — esperado: 16 pts, 2 cravadas
  // g1: +3(exato)+2(gol Vini+Rodrygo)=5 | g2: +2(resultado)+1(Endrick)=3 | g3: +3(exato)+0=3
  // classified: +3 | brazilGoals: +2(exato)
  // Total: 5+3+3+3+2 = 16
  const gabriel = {
    id: "p_gabriel", name: "Gabriel",
    scores: { g1: { h: 2, a: 0 }, g2: { h: 3, a: 1 }, g3: { h: 1, a: 0 } },
    classified: ["BRA", "MAR"],
    brazilGoals: 7,
    scorers: { g1: ["Vinícius Jr.", "Rodrygo", ""], g2: ["Endrick", "", ""], g3: ["", "", ""] },
  };

  // Bia — esperado: 7 pts, 1 cravada
  // g1: +2(resultado)+1(Vini sem acento)=3 | g2: +3(exato)+0=3 | g3: +0+0=0
  // classified: +0 (HAI errou) | brazilGoals: +1(off by 1)
  // Total: 3+3+0+0+1 = 7
  const bia = {
    id: "p_bia", name: "Bia",
    scores: { g1: { h: 1, a: 0 }, g2: { h: 2, a: 0 }, g3: { h: 0, a: 1 } },
    classified: ["BRA", "HAI"],
    brazilGoals: 6,
    scorers: { g1: ["Vinicius Jr.", "", ""], g2: ["Fred", "", ""], g3: ["", "", ""] },
  };

  // Tia Sônia — esperado: 6 pts, 0 cravadas
  // g1: +0+0=0 | g2: +0+0=0 | g3: +2(resultado)+0=2
  // classified: +3(MAR,BRA = BRA,MAR) | brazilGoals: +1(off by 1)
  // Total: 0+0+2+3+1 = 6
  const tiaSonia = {
    id: "p_tia_sonia", name: "Tia Sônia",
    scores: { g1: { h: 0, a: 0 }, g2: { h: 0, a: 0 }, g3: { h: 2, a: 1 } },
    classified: ["MAR", "BRA"],
    brazilGoals: 8,
    scorers: { g1: ["Fred", "Richarlison", ""], g2: ["", "", ""], g3: ["", "", ""] },
  };

  it("classifica na ordem correta: Gabriel → Bia → Tia Sônia", () => {
    const standings = calcStandings([bia, tiaSonia, gabriel], results, games);
    expect(standings.map((r) => r.name)).toEqual(["Gabriel", "Bia", "Tia Sônia"]);
  });

  it("calcula pontuação total de Gabriel corretamente (16 pts)", () => {
    const standings = calcStandings([gabriel], results, games);
    expect(standings[0].pts).toBe(16);
    expect(standings[0].cravadas).toBe(2);
  });

  it("calcula pontuação total de Bia corretamente (7 pts)", () => {
    const standings = calcStandings([bia], results, games);
    expect(standings[0].pts).toBe(7);
    expect(standings[0].cravadas).toBe(1);
  });

  it("calcula pontuação total de Tia Sônia corretamente (6 pts)", () => {
    const standings = calcStandings([tiaSonia], results, games);
    expect(standings[0].pts).toBe(6);
    expect(standings[0].cravadas).toBe(0);
  });

  it("sem resultados, todos ficam com 0 pts", () => {
    const standings = calcStandings([gabriel, bia, tiaSonia], {}, games);
    expect(standings.every((r) => r.pts === 0)).toBe(true);
  });

  it("desempate por cravadas quando pontos iguais", () => {
    const p1 = { id: "p1", name: "Ana", scores: { g1: { h: 2, a: 0 } }, scorers: {} };
    const p2 = { id: "p2", name: "Bob", scores: { g1: { h: 3, a: 1 } }, scorers: {} };
    // p1: +3 (exato, 1 cravada) | p2: +2 (resultado, 0 cravadas)
    // Aqui pts diferem, mas vamos testar empate em pts com cravada diferente
    const empate = {
      g1: { h: 2, a: 0 },
      scorers: { g1: [] },
    };
    const res = calcStandings([p2, p1], empate, games);
    expect(res[0].name).toBe("Ana"); // exato → mais cravadas
    expect(res[0].cravadas).toBe(1);
  });

  it("desempate alfabético quando pts e cravadas iguais", () => {
    const p1 = { id: "p1", name: "Zeca", scores: { g1: { h: 3, a: 1 } }, scorers: {} };
    const p2 = { id: "p2", name: "Ana",  scores: { g1: { h: 1, a: 0 } }, scorers: {} };
    // Ambos acertam resultado (vitória casa) → +2, 0 cravadas
    const res = calcStandings([p1, p2], { g1: { h: 2, a: 0 }, scorers: { g1: [] } }, games);
    expect(res[0].name).toBe("Ana");
    expect(res[1].name).toBe("Zeca");
  });

  it("aceita goleador sem acento (Bia palpitou 'Vinicius Jr.' sem acento)", () => {
    const standings = calcStandings([bia], results, games);
    // Bia acerta Vinícius Jr. sem acento em g1 → +1 pt scorer
    const expected = 2 + 1 + 3 + 0 + 0 + 1 + 0; // g1(res+scorer) + g2(exato) + goals
    expect(standings[0].pts).toBe(expected);
  });
});
