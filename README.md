# Harmonium a mantry

Hlavné štúdio používa skutočné prednesy a učiteľské videá od Jen Lo, Yoga Vidya a Moniky Winklerovej. Videá sa streamujú zo zdrojových YouTube kanálov; zvuk ani video autorov nie sú skopírované do repozitára.

[Otvoriť štúdio](index.html) · [Pôvodné technické cvičenia](technical-exercises.html) · [PDF pôvodných cvičení](harmonium-mantry.pdf)

## Ovládanie

Vyber mantru a prednes. Spusti video. Na cvičenie nastav začiatok A a koniec B tlačidlami pri aktuálnom čase alebo ručne a zapni Opakovať A–B. Rýchlosti ponúka konkrétny YouTube prehrávač. Vyhľadávanie a opakovanie úsekov je približné; nepoužíva synchronizovaný notový prepis.

Podklady pri každom videu odkazujú na rovnakú učiteľskú verziu, keď sú dostupné. Jen Lo ponúka sprievodný platený spevník k svojim videám. Pri výukovej verzii Lokah sú noty a akordy na stránke Yoga Vidya. PDF v tomto repozitári obsahuje skoršie vygenerované technické cvičenia a nie je prepisom vložených prednesov.

## Zverejnenie na GitHub Pages

Nahraj celý obsah balíka do koreňa vetvy main. V Settings → Pages nastav Deploy from a branch → main → /(root). Súbor .nojekyll je súčasťou balíka. Nie je potrebný build ani backend.

Na vložené YouTube prehrávanie treba internet a bežnú HTTP(S) adresu stránky. WebView musí poslať pôvod stránky (Referer); stránka používa strict-origin-when-cross-origin. Ak prehrávač nie je dostupný, vždy je k dispozícii odkaz Otvoriť na YouTube.

## Zdroje

- https://www.jenloyoga.com/harmonium
- https://www.jenloyoga.com/harmonium-store
- https://mein.yoga-vidya.de/profiles/blogs/lokah-samastah-lokah-samastah
- https://shaktiyoga.cz/om-nama-sivaja-gurave/
- https://developers.google.com/youtube/iframe_api_reference
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
