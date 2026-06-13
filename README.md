# Bolão da Família · Copa 2026

App do bolão dos jogos do Brasil. Hospedagem na **Vercel** (site) + **Supabase**
(banco de dados). A família acessa só pelo link, sem conta em lugar nenhum.

Os palpites e os placares ficam salvos no Supabase e são compartilhados entre
todos que abrem o link.

---

## 1. Criar o banco no Supabase (grátis, ~3 min)

1. Acesse https://supabase.com e crie uma conta (pode entrar com o GitHub).
2. Clique em **New project**. Dê um nome, defina uma senha do banco e crie.
3. Espere o projeto subir. No menu lateral, abra **SQL Editor** > **New query**.
4. Cole o conteúdo do arquivo `supabase-schema.sql` e clique em **Run**.
5. No menu lateral, vá em **Project Settings** > **API** e anote dois valores:
   - **Project URL** (ex.: `https://abcd1234.supabase.co`)
   - **anon public** (a chave pública, começa com `eyJ...`)

## 2. Subir o código

Opção A — pelo site da Vercel (mais simples):
1. Crie um repositório no GitHub e suba esta pasta (ou use o botão de import da Vercel).
2. Em https://vercel.com, clique em **Add New > Project** e importe o repositório.
3. A Vercel detecta Vite sozinha. Antes de **Deploy**, abra **Environment Variables**
   e adicione:
   - `VITE_SUPABASE_URL` = a Project URL do passo 1
   - `VITE_SUPABASE_ANON_KEY` = a chave anon public do passo 1
4. Clique em **Deploy**. Em ~1 min você recebe o link público.

Opção B — pela linha de comando:
```bash
npm install
npm install -g vercel
vercel        # segue o assistente
# depois adicione as variáveis de ambiente:
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel --prod
```

## 3. Testar local (opcional)

```bash
npm install
cp .env.example .env   # preencha as duas variáveis
npm run dev
```

---

## Como funciona

- Cada parente abre o link, digita o nome e dá o placar dos 3 jogos.
- Os palpites ficam **secretos**; são revelados quando o jogo trava (horário do
  apito) ou quando você lança o placar oficial.
- Pontos: cravou o placar = **2**, acertou só o vencedor = **1**, errou = **0**.
- A aba **Placares** pede o código de organizador (`arichan`) para lançar os
  resultados.

## Observações

- A chave `anon` é pública por natureza — pode ficar no site sem problema. Ela só
  dá acesso à tabela `kv` conforme as regras do `supabase-schema.sql`.
- O segredo dos palpites é garantido pela lógica do app. Um parente muito técnico
  poderia, em tese, consultar a tabela direto pela API — para um bolão de família
  isso é aceitável. Se quiser blindar de verdade, dá para mover a revelação para
  uma função no servidor depois.
- O código de organizador fica no código do site. Segura quem só clica na aba,
  mas não é uma senha forte.
