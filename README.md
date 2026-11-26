# Chessy XR — Xadrez privado online

Aplicativo web responsivo para computadores, Mac, iPhone e iPad. Dois jogadores reais, peças em tons de madeira clara e escura, **sem dicas, motor de IA ou destaques de jogadas possíveis**.

Arquitetura preparada para rodar **100% na Vercel** (Frontend Vite + Serverless Functions em `/api` + **Upstash Redis** com sincronização por polling leve).

## Instalar e iniciar localmente

Requer Node.js 20+.

```bash
npm install
npm run dev
```

Abra http://localhost:5173 no computador. Em desenvolvimento local, se as variáveis do Upstash Redis não estiverem definidas, o servidor usa armazenamento em memória automaticamente.

## Como jogar

1. O primeiro jogador digita uma senha de pelo menos 8 caracteres e clica em **Criar sala privada**.
2. Envia ao convidado **o código de 10 caracteres e a senha**, por um canal privado.
3. O convidado digita o mesmo código e senha e entra na sala.
4. Apenas os dois ocupantes (autenticados por token de sessão) podem ver o estado e movimentar peças; o servidor valida turnos e movimentos com `chess.js`.

## Deploy 100% na Vercel

1. Suba este repositório para o GitHub/GitLab/Bitbucket e importe o projeto na **Vercel** (o framework Vite e as rotas `/api/*` são detectados automaticamente na raiz).
2. No painel do projeto na Vercel, abra **Storage → Marketplace → Upstash for Redis** e conecte um banco gratuito ao projeto.
   - A Vercel injeta automaticamente `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` (também compatível com `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
3. Faça um **Redeploy** após conectar o Redis.
4. Para iPhone/iPad: Safari → Compartilhar → Adicionar à Tela de Início.

## Privacidade e limites

- Não há lista pública de partidas, matchmaking ou acesso como espectador.
- Código aleatório + senha obrigatória; senha derivada com `scrypt` e salt por sala; comparações em tempo constante e limitação distribuída de tentativas por IP no Redis (12 tentativas/min).
- Cada jogador recebe um token secreto armazenado no `sessionStorage` do navegador (permite recarregar a página ou trocar de app no celular sem perder a partida).
- As salas expiram automaticamente no Redis após 6 horas de inatividade (ou 30 minutos após o encerramento da partida).
- A senha é transmitida ao servidor no ingresso: **use HTTPS em produção** (padrão na Vercel).
- Peças são símbolos Unicode estilizados como madeira, não modelos 3D.
