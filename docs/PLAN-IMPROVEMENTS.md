# Plan d'amélioration - CrowdSec Web UI

**Objectif**: Se rapprocher de la Console CrowdSec Security Engines Dashboard
(https://docs.crowdsec.net/u/console/security_engines/dashboard/)

**Modèle**: Garder le système d'instances existantes (config fichier YAML/env),
pas d'enrollment cloud, pas de notion d'organisation multi-tenant.

**Historique**: v1 de ce plan contenait des erreurs factuelles (voir "Erreurs
corrigées" en bas de fichier) découvertes en confrontant le plan au code réel.
Cette version (v2) a été vérifiée contre le codebase avant d'être écrite.

---

## Spike `/v1/machines` — CONCLU : NO-GO

Vérifié directement dans le code source CrowdSec
(`pkg/apiserver/controllers/controller.go`, branche `master`, routes
enregistrées dans `NewV1()`) :

**Routes JWT (watcher token, celui que `server/lapi.ts` utilise déjà)** :
`POST/GET/HEAD /alerts`, `GET/HEAD /alerts/:id`, `DELETE /alerts/:id`,
`DELETE /alerts`, `DELETE /decisions`, `DELETE /decisions/:id`,
`GET /heartbeat`, `GET /allowlists*`, `DELETE /watchers/self`.

**Routes API-Key (bouncer)** : `GET/HEAD /decisions`,
`GET/HEAD /decisions/stream`.

**Aucune route `GET /v1/machines` ni `GET /v1/watchers` n'existe côté HTTP
public**, dans aucun des deux modes d'auth. Les seules routes liées aux
machines sont `POST /watchers` (création/enrollment, gated par
`AbortRemoteIf`), `POST /watchers/login`, `GET /refresh_token` et
`DELETE /watchers/self` (une machine ne peut s'auto-supprimer, pas lister
les autres).

`cscli machines list` ("requires local API") passe donc par un accès direct
à la base du LAPI, pas par cette API HTTP — aucun changement de scope
d'auth watcher ne débloquera cet endpoint car **il n'existe tout
simplement pas**.

**Conséquence, définitive et non contournable dans le modèle actuel** :
version CrowdSec de l'engine, IP réelle de la machine, date d'enrollment et
liste des log processors (distributed setup) **ne sont pas récupérables**
depuis ce projet. Ces champs sont retirés du scope :

- ~~Niveau 4.5 LogProcessorsSection~~ → **supprimé du plan**
- ~~Niveau 6.2 VersionBadge~~ → **supprimé du plan**
- Summary de `SecurityEngineDetailsPage` (Niveau 3.3) : limité à ce qui
  existe réellement (id/nom d'instance depuis la config, statut
  `LapiStatus`, stats agrégées), pas de version/IP/enroll date.

---

## Niveau 1 - Quick win

### 1.1 Copy IP click

Vérifié: aucun copier-coller n'existe sur les IP dans Alerts/Decisions
(seul `Settings.tsx:415` a un `navigator.clipboard.writeText` pour le secret
TOTP). Gap réel, à faire.

- [ ] `client/src/components/ui/CopyableText.tsx` - NOUVEAU composant
  - Utiliser `<button>` natif + classes Tailwind existantes (pas de
    composant `Button` — **il n'existe pas** dans `components/ui/`,
    vérifié par `Glob`. Le codebase utilise systématiquement des `<button>`
    avec `className="... bg-primary-600 hover:bg-primary-700 ..."`).
  - Toast de confirmation via `useOptionalToast()` (existe déjà,
    `contexts/useToast.ts`).
- [ ] `client/src/pages/Alerts.tsx` - Remplacer affichage IP source par
      `CopyableText`
- [ ] `client/src/pages/Decisions.tsx` - Remplacer affichage IP par
      `CopyableText`

**Note**: le bulk delete (alerts et decisions) est déjà entièrement
implémenté (backend `deletion-service.ts`, frontend `Decisions.tsx`/
`Alerts.tsx`, tests). Rien à faire ici — voir section "Erreurs corrigées".

---

## Niveau 2 - Dashboard

### 2.1 Vue Card/Table toggle

- [ ] `client/src/pages/Dashboard.tsx` - Toggle card/table persistée en
      localStorage, réutiliser le pattern déjà en place pour
      `dashboard_granularity` / `dashboard_scale_mode`
      (`localStorage.setItem` dans un `useEffect`, voir lignes ~719-729)

### 2.2 SecurityEngineCard component

- [ ] `client/src/components/SecurityEngineCard.tsx` - NOUVEAU
  - Basé sur `InstanceSummary` (déjà défini dans `shared/contracts.ts:60`),
    **pas** sur une nouvelle entité "SecurityEngine" — c'est le même objet,
    on ne fait qu'un habillage visuel différent.
  - Champs réellement disponibles aujourd'hui: `id`, `name`, `icon`,
    `lapi_status.isConnected`, `lapi_status.lastCheck`,
    `lapi_status.lastError`.
  - Stats (alerts/decisions count) : nécessite un appel agrégé par
    instance — vérifier si `query-service.ts` expose déjà un total par
    `instance_id` (à confirmer avant d'écrire le composant; sinon ajouter
    un endpoint `GET /api/security-engines/:id/summary` côté serveur).
  - Version/enroll date/tags : dépendent du spike `/v1/machines` et du
    chantier Tags (Niveau 6.3) — ne pas les coder en dur tant que non
    résolus, afficher "—" si absent.

---

## Niveau 3 - Nouvelle page Security Engines

*(à démarrer seulement après le spike `/v1/machines`)*

### 3.1 Route
- [ ] `client/src/App.tsx` - Ajouter routes `/security-engines` et
      `/security-engines/:id`, suivre le pattern `lazy()` déjà utilisé pour
      les autres pages (voir imports en tête de `Dashboard.tsx`)

### 3.2 SecurityEnginesPage
- [ ] `client/src/pages/SecurityEngines.tsx` - NOUVEAU
  - Source de données: `fetchConfig().instances` (déjà retourné par
    `GET /api/config`, cf. `ConfigResponse.instances` dans
    `shared/contracts.ts:561`)
  - Recherche par nom/ID (filtrage client, pas besoin d'endpoint dédié)
  - Toggle card/table view (même logique que 2.1)

### 3.3 SecurityEngineDetailsPage
- [ ] `client/src/pages/SecurityEngineDetails.tsx` - NOUVEAU
  - Summary: ID/nom d'instance (config), statut LAPI (`LapiStatus`),
    dernière vérification (`lastCheck`), stats agrégées (alerts/decisions).
    **Pas de version, IP machine ou enroll date** (spike NO-GO ci-dessus).
  - **Pas de "Transfer"** — n'a pas d'équivalent dans un modèle sans
    organisation/multi-tenant (voir "Erreurs corrigées")
  - **"Archive"** reformulé : masquer l'engine de la vue par défaut
    (flag local en DB, PAS suppression de la config YAML/env — l'app ne
    doit pas réécrire les fichiers de config au runtime)
  - **"Remove"** retiré du scope : les instances sont définies dans
    `server/config-file.ts`, chargées au démarrage avec un système de
    diff/override ; les supprimer depuis l'UI impliquerait soit de
    réécrire la config (hors scope), soit un bouton trompeur qui ne fait
    rien de réel. Si un contrôle est nécessaire, ce sera "masquer"
    (= Archive), pas "supprimer".
  - **Edit name/tags** : voir Niveau 6.3, dépend d'un nouveau stockage

---

## Niveau 4 - Details sections

### 4.1 RemediationComponents (bouncers)

Rebrancher sur les données Prometheus déjà collectées, **pas** une
nouvelle source :

- [ ] `client/src/components/RemediationComponents.tsx` - NOUVEAU wrapper
      d'affichage
  - Réutiliser `CrowdsecMetricsApiEntity` (déjà défini dans
    `shared/contracts.ts:598`, déjà peuplé par `server/metrics.ts` et déjà
    affiché dans `client/src/pages/Metrics.tsx`) : `name`, `requests`,
    `decisionsOk`, `decisionsKo`, `mode`
  - "Traffic dropped / processed" = `decisionsKo` / `decisionsOk` +
    `requests`, déjà calculés — ne pas réinventer un modèle de metrics
  - Badge status: utiliser `variant="success"` / `variant="danger"` sur le
    composant `Badge` existant (`components/ui/Badge.tsx`) —
    **`"destructive"` n'existe pas**, les variantes réelles sont
    `default | success | warning | danger | info | secondary | outline`

### 4.2 RemediationMetricsModal
- [ ] `client/src/components/RemediationMetricsModal.tsx` - NOUVEAU
  - Réutiliser le composant `Modal` existant (`components/ui/Modal.tsx`)
  - Contenu: détail par route (`CrowdsecMetricsRouteActivity`, déjà défini)

### 4.3 ScenariosSection

**Ne pas repartir de zéro** : `client/src/pages/Metrics.tsx:613` a déjà un
`ScenarioList` qui consomme `CrowdsecMetricsScenario[]`
(`current`, `instantiations`, `overflows`, `underflows`, `canceled`,
`poured`).

- [ ] `client/src/components/ScenariosSection.tsx` - NOUVEAU, extrait le
      rendu de `ScenarioList` dans un composant partagé réutilisable par
      `Metrics.tsx` ET `SecurityEngineDetails.tsx` (éviter la duplication)
- **Limite connue**: on n'a que les scénarios qui ont *déclenché* des
  events récemment (données Prometheus), pas la liste exhaustive des
  scénarios *installés* comme dans la Console (qui lit l'état du hub
  local). Pas de lien "View on Hub" fiable sans cette info — au mieux un
  lien best-effort vers `hub.crowdsec.net/author/<nom>` si le nom suit le
  format `author/scenario`, à afficher comme approximatif.

### 4.4 BlocklistsSection

Partiellement faisable avec les données existantes :

- [ ] `client/src/components/BlocklistsSection.tsx` - NOUVEAU
  - Base: décisions dont l'origine est `lists` (constante
    `LISTS_ALERT_ORIGIN` déjà définie dans `server/app.ts:298`) ou dont le
    scope source est `crowdsecurity/community-blocklist`
    (`COMMUNITY_BLOCKLIST_SOURCE_SCOPE`, `server/app.ts:299`)
  - Regrouper par scénario/scope pour approximer "une blocklist" et
    compter les décisions actives associées
  - **Non disponible** (pas de source de données) : nombre total d'IP
    dans la blocklist (vs. seulement celles qui ont matché), et
    "false positives" — cette dernière métrique est calculée côté Console
    cloud à partir de données bouncer non collectées ici. Ne pas les
    afficher, ou les marquer explicitement "non disponible en self-hosted"
    plutôt que d'inventer une valeur.

### 4.5 ~~LogProcessorsSection~~ — retiré du plan

Impossible sans `/v1/machines` (voir spike, NO-GO définitif). Pas de
fallback disponible dans ce modèle d'architecture.

---

## Niveau 5 - Integration

### 5.1 SecurityEngineSelector
- [ ] `client/src/components/SecurityEngineSelector.tsx` - NOUVEAU
  - Dropdown pour filtrer Alerts/Decisions par engine
  - Réutiliser `DropdownSelect` existant (`components/ui/DropdownSelect.tsx`,
    déjà utilisé dans `Metrics.tsx`) plutôt que d'en recréer un

### 5.2 Dashboard integration
- [ ] `client/src/pages/Dashboard.tsx` - Bouton lien vers `/security-engines`

### 5.3 Inactivity filter (30 jours, comme la Console)
- [ ] Filtrer/grisé les engines sans activité > 30 jours dans
      `SecurityEnginesPage` (calcul côté client à partir de
      `lapi_status.lastCheck`, pas besoin de backend dédié dans un premier
      temps)

---

## Niveau 6 - Polish

### 6.1 i18n
- [ ] `client/src/locales/en.json` + `fr.json` (+ autres langues déjà
      supportées: ar, de, es, hi, ja, pt, ru, zh — vérifier si on traduit
      toutes les langues ou seulement en/fr en premier)

### 6.2 ~~VersionBadge~~ — retiré du plan

Impossible sans `/v1/machines` (voir spike, NO-GO définitif).

### 6.3 Tags — chantier de stockage, pas juste une UI

**Vérifié**: aucune notion de "tags" sur une instance nulle part dans
`server/instances-config.ts` ni `shared/contracts.ts`. Ce n'est pas un item
de todo UI, c'est une nouvelle fonctionnalité de persistance :

- [ ] Nouvelle table SQLite (ex: `instance_metadata`) : `instance_id`,
      `tags` (JSON), `display_name_override`, `archived_at`
  - Raison: les instances viennent de la config YAML/env (immuable au
    runtime), il faut un store à part pour tout ce qui est éditable
    depuis l'UI (tags, nom personnalisé, archivage)
- [ ] `server/database.ts` - méthodes CRUD sur cette table
- [ ] `server/app/api-routes.ts` - endpoints
      `GET/PUT /api/security-engines/:id/metadata`
- [ ] `client/src/components/TagInput.tsx` - NOUVEAU, UI d'édition

---

## Fichiers à créer

```
client/src/components/ui/CopyableText.tsx
client/src/components/SecurityEngineCard.tsx
client/src/components/RemediationComponents.tsx
client/src/components/RemediationMetricsModal.tsx
client/src/components/ScenariosSection.tsx        (extrait de Metrics.tsx)
client/src/components/BlocklistsSection.tsx
client/src/components/SecurityEngineSelector.tsx
client/src/components/TagInput.tsx
client/src/pages/SecurityEngines.tsx
client/src/pages/SecurityEngineDetails.tsx
```

`LogProcessorsSection.tsx` et `VersionBadge` définitivement retirés
(spike NO-GO).

## Fichiers à modifier

```
client/src/pages/Alerts.tsx        # CopyableText sur IP
client/src/pages/Decisions.tsx     # CopyableText sur IP
client/src/pages/Dashboard.tsx     # view toggle + lien SecurityEngines
client/src/pages/Metrics.tsx       # extraire ScenarioList en composant partagé
client/src/App.tsx                 # routes
client/src/locales/en.json         # i18n
client/src/locales/fr.json         # i18n
server/database.ts                 # table instance_metadata (tags)
server/app/api-routes.ts           # endpoints metadata engine
```

---

## Ordre d'implémentation

```
1. Spike /v1/machines — CONCLU NO-GO (voir plus haut, vérifié sur source)
2. CopyableText (composant réutilisable)
3. SecurityEngineCard (avec champs réellement disponibles seulement)
4. Dashboard: toggle card/table
5. SecurityEnginesPage + route
6. Extraction ScenarioList de Metrics.tsx en composant partagé
7. RemediationComponents (basé sur metrics existantes)
8. BlocklistsSection (basé sur LISTS_ALERT_ORIGIN existant)
9. SecurityEngineDetailsPage (assemble 6+7+8)
10. Tags: table SQLite + endpoints + TagInput
11. i18n complet
```

---

## Décisions actées

- **Bulk delete**: déjà implémenté, aucune action requise
- **Security Engine Cards**: avec stats si un endpoint d'agrégation par
  instance existe/est ajouté ; sinon statut + métadonnées seulement
- **Modèle**: garder les instances existantes (config fichier), pas de
  cloud enrollment, pas de notion d'organisation

---

## Erreurs corrigées depuis la v1 de ce plan

Cette section est conservée pour traçabilité — la v1 avait été écrite sans
vérifier suffisamment le code existant :

1. **Bulk delete decisions proposé comme nouveau** : faux, entièrement
   implémenté (`server/app/deletion-service.ts:564,598`,
   `server/app/api-routes.ts:1449`, `client/src/lib/api.ts`,
   `client/src/pages/Decisions.tsx:1449,1502`, testé dans
   `__tests__/decisions/actions.test.tsx`). Idem pour les alerts
   (`bulkDeleteAlerts`).
2. **Composant `Button` référencé dans les exemples de code** : n'existe
   pas dans `components/ui/`. Le codebase utilise des `<button>` natifs
   avec classes Tailwind (`bg-primary-600 hover:bg-primary-700...`).
3. **`Badge variant="destructive"`** : variante inexistante. Les vraies
   valeurs sont `default | success | warning | danger | info | secondary |
   outline` (`components/ui/Badge.tsx`).
4. **Actions "Transfer"** copiées de la Console sans vérifier leur sens
   dans un modèle sans organisation multi-tenant — retirées.
5. **Action "Remove"** proposée sans tenir compte du fait que les
   instances viennent d'une config YAML/env chargée au démarrage
   (`server/config-file.ts`) — requalifiée en "Archive" (masquage, pas
   suppression de config).
6. **"Tags"** traité comme simple item UI alors qu'aucun stockage
   n'existe pour ça — requalifié en chantier de persistance (nouvelle
   table SQLite).
7. **Scenarios/Blocklists présentés comme sources de données entièrement
   nouvelles** : Scenarios a déjà une implémentation partielle dans
   `Metrics.tsx` (à réutiliser) ; Blocklists est partiellement dérivable
   de `LISTS_ALERT_ORIGIN`/`COMMUNITY_BLOCKLIST_SOURCE_SCOPE` déjà présents
   dans `server/app.ts`, mais certains champs Console (IP count total,
   false positives) ne sont pas reproductibles en self-hosted.
8. **`/v1/machines`** affirmé comme disponible sans vérification — reste
   non confirmé pour un accès watcher distant ; `cscli machines list`
   confirme seulement que la donnée existe côté LAPI local/admin.
