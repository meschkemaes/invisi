# Invisi

Site público da **Invisi**, empresa brasileira de tecnologia e serviços de
privacidade voltada à redução responsável da exposição online de dados
pessoais ligados a atividades empresariais.

## Páginas

- Landing page: `index.html`
- Pesquisa de mercado: `pesquisa.html`
- Política de Privacidade: `privacidade.html`
- Confirmação de lead: `obrigado.html`
- Confirmação da pesquisa: `pesquisa-obrigado.html`

## Acesso público

- Site: "<https://invisi.com.br/>"
- Pesquisa: "<https://invisi.com.br/pesquisa.html>"

## Execução local

O site usa somente HTML, CSS e JavaScript. Não há etapa de build: abra
`index.html` ou `pesquisa.html` diretamente no navegador.

## Prévia de exposição

A landing page oferece uma prévia no próprio site: o visitante informa o nome,
o navegador consulta cadastros públicos de sócio e CNPJ e a página mostra um
recorte mascarado do que veio. Se a busca não achar, a prévia diz que não achou.
O diagnóstico completo continua no formulário de contato.

## Funil anônimo

A landing (`funil.js`) registra passos da visita em
`POST https://api.invisi.com.br/funil`: página, prévia visível, prévia pedida,
resultado, clique no cadastro e envio aceito ou recusado. O identificador é um
UUID aleatório guardado no `sessionStorage` do navegador. O corpo não leva
nome, CNPJ, e-mail, telefone nem o texto da busca.

## Meta Pixel

O pixel mede visitas e conversões sem parâmetros e sem dados pessoais
(nada de nome, CPF, CNPJ, e-mail, telefone ou texto da busca). O snippet
desliga a configuração automática (`autoConfig`) antes do `init`, para o
navegador não ler os campos da página nem enviar correspondência avançada:

- `PageView` em cada página pública.
- `ViewContent` uma vez por visita quando a prévia termina. A busca com zero
  resultados também conta: a consulta respondeu e a página mostrou o recorte.
  Se a consulta falha, o evento não dispara.
- `Lead` quando `POST /leads/site` responde com sucesso, antes do
  redirecionamento. `obrigado.html` dispara `Lead` no carregamento só se essa
  visita ainda não disparou (é o caso do envio que cai no Web3Forms) e apaga
  essa marca da sessão.
- As páginas públicas não têm link de contratação, pagamento ou checkout, então
  `InitiateCheckout` não é usado.

## Formulários

O formulário de diagnóstico, o modal de contato e a pesquisa utilizam
[Web3Forms](https://web3forms.com/) e encaminham as submissões para o canal
responsável da Invisi.

O diagnóstico pede o CNPJ da empresa, confere os dígitos na página e envia só os 14 números. Não pedimos CPF.
Após um envio aceito pela API, o visitante é redirecionado para `https://invisi.com.br/obrigado.html`.
Se o e-mail já tem cadastro, o formulário mostra o aviso na própria página e um link para o painel, sem reenviar pelo Web3Forms.
Se a API recusar o CNPJ, o aviso fica no campo, sem reenviar pelo Web3Forms.
Se a API falhar por outro motivo, o envio segue pelo Web3Forms.

A pesquisa contém 10 perguntas e pode ser respondida sem identificadores
diretos. Nome e WhatsApp são opcionais e usados somente quando o participante
solicita contato e aceita a autorização correspondente.

## Arquivos públicos

- `index.html`, `styles.css`, `script.js`, `espelho.js`, `funil.js` e `meta.js`: lp, prévia, funil anônimo e eventos do pixel;
- `pesquisa.html`, `pesquisa.css` e `pesquisa.js`: pesquisa de mercado;
- `obrigado.html` e `pesquisa-obrigado.html`: páginas de confirmação;
- `privacidade.html`: informações sobre tratamento de dados;
- `favicon.svg`: identidade visual;
- `.nojekyll`: configuração do GitHub Pages.

Planos estratégicos, Canvas, playbooks, pipelines, resultados e registros
internos não são armazenados neste repositório público.

## Aviso

A Invisi não promete remoção universal de dados nem substitui aconselhamento
jurídico. A aplicabilidade de solicitações depende da fonte, da base legal, de
obrigações regulatórias e de decisões de terceiros.
