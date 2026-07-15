# Simulado online

Responder as questões no próprio site, além de baixar o PDF.

## Por que

Hoje a home mostra um trecho de 160 caracteres de cada questão sorteada e um
botão de baixar PDF. O preview não serve pra nada: não dá pra ler a questão nem
decidir se o simulado ficou bom.

A aposta não é gamificação — é **fricção zero**. Nenhum site de ENEM decente
deixa montar um simulado misturando anos e matérias e começar a responder em
dez segundos, sem cadastro e sem anúncio. É esse o posicionamento:

> Monte do seu jeito, responda online ou imprima. Sem cadastro.

O PDF deixa de ser o produto e passa a ser diferencial: é a única coisa aqui que
os concorrentes não fazem.

**Meta:** uso real por dezenas de pessoas. Não é projeto de crescimento — não
há SEO, ranking nem retenção paga na conta.

## Decisões tomadas

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Identidade | nenhuma | Cadastro é a maior fricção do concorrente; é a nossa vantagem |
| Persistência | `localStorage` | Sem banco, sem LGPD, sem custo |
| Modos | treino e prova | O usuário escolhe no início |
| Correção | no servidor | Ver "Correção" abaixo |
| Nota | % de acerto | Ver "Não existe TRI aqui" |
| Navegação | rolagem única | Ver "Rolagem única" |

## Não existe TRI aqui

O primeiro pedido vai ser *"quanto eu tiraria no ENEM?"*. **Não dá pra responder
isso honestamente e o produto não vai tentar.**

O TRI real exige os parâmetros de cada item — discriminação, dificuldade e
acerto casual. A api.enem.dev não entrega nada disso; os campos da questão são
`title`, `index`, `discipline`, `language`, `year`, `context`, `files`,
`correctAlternative`, `alternativesIntroduction` e `alternatives`. Não há
qualquer medida de dificuldade.

Um "TRI estimado" chutado seria pior que número nenhum: alguém decide se tenta
medicina com base numa conta inventada. O resultado mostra **percentual de
acerto por matéria**, e diz na tela que não é TRI.

## Escopo da v1

Dentro:

- Renderizar a questão inteira — enunciado, figuras, fórmulas nas alternativas
- Escolher entre treino e prova
- Responder, com as questões numa rolagem só
- Resultado com acerto por matéria
- Revisão: cada questão, sua resposta e a correta
- Sessão guardada no `localStorage`, sobrevivendo a refresh e a fechar a aba

Fora (fases seguintes):

- Cronômetro
- Histórico de simulados anteriores

Se responder uma questão não ficar bom, cronômetro e histórico não salvam.

## Os dois modos são um produto só

Treino e prova só divergem em **quando revelar**. Todo o resto — renderização,
navegação, seleção, resultado — é o mesmo código.

| | Treino | Prova |
| --- | --- | --- |
| Revela | ao responder | ao finalizar |
| Cronômetro | não | fase 2 |
| Resto | idêntico | idêntico |

Tratar isso como dois produtos dobra o custo à toa.

## O trabalho real está na renderização

O grosso não é o quiz — é mostrar a questão. A UI hoje não renderiza imagem
nenhuma, e as questões do ENEM são cheias de gráfico, tabela e fórmula. Sem
isso, metade delas é impossível de responder.

Em HTML isso é bem mais simples que no PDF: imagem no meio do texto só funciona,
sem layout manual. Mas o **parsing** do conteúdo é o mesmo problema já resolvido
em `backend/src/pdf/pdf.service.ts`: separar texto e figura em ordem de leitura,
tirar o markdown de itálico que a API emite como `_N_`, lidar com os homóglifos
cirílicos do OCR.

**Esse parser é extraído para `backend/src/common/question-content.ts` e passa a
servir os dois consumidores.** O `/exams/draw` devolve o conteúdo já em
segmentos, e o frontend não precisa saber nada de markdown. Duplicar a lógica no
front garante que as duas versões divirjam.

## API

Tudo passa a girar em torno de referências (`year` + `index`), como o PDF já faz.

### Conteúdo em segmentos

```ts
type ContentSegment =
  | { kind: 'text'; value: string }
  | { kind: 'image'; url: string };
```

### `POST /exams/draw` (formato alterado)

O único consumidor é o nosso frontend, então a resposta é remodelada em vez de
ganhar campos novos ao lado dos antigos:

```jsonc
[
  {
    "year": 2023,
    "index": 147,
    "title": "Questão 147 - ENEM 2023",
    "discipline": "matematica",
    "context": [
      { "kind": "text", "value": "Um artista plástico esculpe…" },
      { "kind": "image", "url": "https://enem.dev/…/565c2d5a.png" }
    ],
    "alternativesIntroduction": [{ "kind": "text", "value": "Qual é a massa…" }],
    "alternatives": [
      { "letter": "A", "content": [{ "kind": "text", "value": "1.198,8" }] },
      { "letter": "B", "content": [{ "kind": "image", "url": "https://…" }] }
    ]
  }
]
```

Sem `correctAlternative` — como já é hoje.

### `POST /exams/check` (novo)

`letter` aceita `null`: em prova dá pra finalizar com questões em branco, e
branco conta como erro (como no ENEM).

```jsonc
// requisição
{ "answers": [{ "year": 2023, "index": 147, "letter": "B" }] }

// resposta
[{ "year": 2023, "index": 147, "correct": false, "correctAlternative": "D" }]
```

Em treino, chamado com uma questão por vez. Em prova, com todas de uma vez ao
finalizar.

### `POST /pdf/questions`

Sem mudança.

## Correção: o que isso garante e o que não garante

A correção fica no servidor, mas **não é proteção contra trapaça, e o design não
finge que é.**

A resposta precisa dizer qual era a alternativa certa — "você errou" sem dizer o
certo não ensina nada, e a revisão é metade do valor do produto. Logo, quem
quiser pode mandar cinco respostas quaisquer e colher o gabarito inteiro. É
farmável por quem tiver intenção.

O que se ganha de fato: **o gabarito não fica no payload da página enquanto a
pessoa responde.** Sem spoiler acidental com o DevTools aberto, sem React
DevTools entregando de graça. Sai de "está à mostra" para "exige intenção".

Isso basta porque não há ranking nem nota pública: quem trapaceia engana só a si
mesmo. O que não pode acontecer é a pessoa ver a resposta **sem querer**.

## Fluxo

Três telas, uma máquina de estado na home:

```
montar ──sortear──> responder ──finalizar──> resultado ──┬─> revisão
                                                          └─> baixar PDF
```

Sem rotas novas na v1: quem recarrega volta pro simulado em andamento pela
sessão salva, não pela URL. Rotas só passam a valer a pena quando houver
histórico e alguém quiser compartilhar link de um simulado — fase 2.

A escolha entre treino e prova fica na tela de montar, ao lado do botão de
sortear: é uma propriedade do simulado, não uma preferência global.

## Sessão

Uma chave no `localStorage` com o simulado em andamento: as questões como
vieram, as respostas dadas, o modo e a fase (respondendo ou já finalizado).

As questões vão cruas, sem remontar por referência, porque o `/exams/draw` já
devolve elas sem gabarito — a decisão de tirar as respostas do payload é o que
torna isso seguro de guardar. São ~200 KB para 45 questões, contra um limite de
5 MB.

Ao abrir o site com uma sessão salva, a pessoa cai direto de volta nela.

## Rolagem única, sem scroll infinito

As questões ficam todas numa rolagem só, na ordem em que foram sorteadas.

**Não há virtualização nem paginação, de propósito.** A intuição diz que 45
questões com imagem pesam; os números dizem que não. Medindo o bloco de
matemática de 2023:

| | |
| --- | --- |
| Imagens de um simulado de 45 questões | **0,89 MB** no total |
| Média por imagem | 20 KB |
| Maior imagem encontrada | 199 KB |
| DOM das 45 questões | ~113 KB |

Um simulado inteiro pesa menos que uma foto de celular. `loading="lazy"` nativo
resolve o resto — o browser só busca a figura quando ela se aproxima da tela.
Trazer `react-window` ou similar resolveria um problema inexistente e ainda
quebraria Ctrl+F e âncora de link.

As imagens ainda precisam de `max-width: 100%`: a API entrega até 1248px de
largura e o layout não pode estourar no celular.

## Como saber se deu certo

- Um estudante consegue responder uma questão com gráfico sem precisar do PDF
- O resultado responde "onde eu tô mal?" numa olhada, sem fingir que é TRI
- Montar e começar a responder leva menos de dez segundos, sem cadastro
- Quem quer só imprimir continua conseguindo, sem passar pelo quiz
- Recarregar a página no meio do simulado não perde nada

## Riscos e questões abertas

**Questões anuladas.** 2023 não tem as questões 34 e 174, e 2011 tem dados de
idioma incompletos. O sorteio já lida com isso, mas a tela de resultado não pode
assumir que todo simulado tem o total redondo que foi pedido.

**Sessão única.** O `localStorage` guarda um simulado em andamento. Sortear um
novo por cima descarta o anterior — e isso precisa de confirmação na tela, senão
alguém perde 40 questões respondidas por um clique errado.

**Trocar de aba.** Duas abas com simulados diferentes vão brigar pela mesma
chave do `localStorage`. Com o público esperado isso é aceitável; vale saber que
existe.
