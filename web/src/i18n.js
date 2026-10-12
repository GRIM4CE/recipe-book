// Interface strings and recipe localization. Pure: no React, so it is testable
// on its own. The React side (context + hook) lives in useLanguage.jsx.

export const LANGUAGES = ['en', 'fr'];
export const LANGUAGE_NAMES = { en: 'English', fr: 'Français' };

const KEY = 'recipe-book-lang';

// Every key must exist in both languages and {vars} must match between them
// (tests enforce both). Language names used mid-sentence live in
// languageFrom_* because French needs "de l’anglais" but "du français".
export const STRINGS = {
  en: {
    appName: 'Recipe Book',
    language: 'Language',
    languageFrom_en: 'English',
    languageFrom_fr: 'French',

    // Header and page-level notices
    categories: 'Categories',
    tags: 'Tags',
    settings: 'Settings',
    signIn: 'Sign in',
    passkeyOffer: 'Add a passkey to sign in with just Face ID / fingerprint next time.',
    addPasskey: 'Add passkey',
    notNow: 'Not now',
    loading: 'Loading…',
    loadError: 'Couldn’t load recipes: {error}',
    recipeMissing: 'That recipe doesn’t exist (anymore).',

    // Grid
    searchPlaceholder: 'Search recipes, ingredients…',
    all: 'All',
    filters: 'Filters',
    byPerson: 'Added by',
    ingredient: 'Ingredient',
    ingredientPlaceholder: 'e.g. campari',
    findGood: 'Find me something good',
    noMatch: 'Nothing matches',
    showing: 'Showing {shown} of {total}. Search or filter to find the rest.',

    // Detail
    back: 'Back',
    share: 'Share',
    duplicate: 'Duplicate',
    duplicating: 'Duplicating…',
    edit: 'Edit',
    linkCopied: 'Link copied',
    shareFailed: 'Couldn’t share',
    ingredients: 'Ingredients',
    scaleRecipe: 'Scale recipe',
    instructions: 'Instructions',
    notes: 'Notes',
    addedBy: 'Added by {name} · {date}',
    translatedFrom: 'Translated from {language}',
    translationStale: 'The original was edited since this translation',
    translationPending: 'Not translated yet',
    translate: 'Translate',
    translating: 'Translating…',

    // Form
    editRecipe: 'Edit recipe',
    newRecipeTitle: 'New recipe',
    importFound: 'Found {n} recipes — pick one',
    importTitle: 'Import from a URL, text, or photo',
    importUrlPlaceholder: 'Link to a recipe page or Claude chat',
    extractUrl: 'Extract from URL',
    importTextPlaceholder: '…or paste recipe text here',
    extractText: 'Extract from text',
    extractPhotos: 'Extract from photos',
    readingPage: 'Reading the page…',
    readingText: 'Reading your text…',
    readingPhoto: 'Reading your photo…',
    readingPhotos: 'Reading {n} photos…',
    importWait: 'this can take up to a minute',
    importUnreachable: 'Couldn’t reach the server. Check your connection and try again.',
    importServerDied:
      'The server stopped responding (error {status}). It may have run out of time reading that page — try again, or paste the recipe text instead.',
    importUnknown: 'Import failed for an unknown reason.',
    title: 'Title',
    summary: 'Summary',
    summaryPlaceholder: 'One line about this recipe',
    servings: 'Servings',
    servingsPlaceholder: 'e.g. 4',
    category: 'Category',
    none: 'None',
    tagsHint: 'press Enter after each',
    tagPlaceholder: 'e.g. Wing Sauces',
    removeTag: 'Remove tag {tag}',
    photo: 'Photo',
    replacePhoto: 'Replace photo',
    addPhoto: 'Add photo',
    remove: 'Remove',
    onePerLine: 'one per line',
    onePerStep: 'one step per line',
    ingredientsPlaceholder: '2 cups flour\n2 eggs',
    instructionsPlaceholder: 'Mix everything.\nBake at 375°F.',
    notesHint: 'tips, substitutions, anything',
    notesPlaceholder: 'e.g. Doubles well. Swap butter for oil to make it dairy-free.',
    cancel: 'Cancel',
    saving: 'Saving…',
    saveRecipe: 'Save recipe',
    delete: 'Delete',
    deleteTitle: 'Delete “{title}”?',
    deleteMessage: 'This can’t be undone.',

    // Login
    loginName: 'Email or username',
    devHint: 'Dev mode: any name signs you in, writes run as “dev”.',
    emailCode: 'Code from your email',
    signingIn: 'Signing in…',
    signInPasskey: 'Sign in with passkey',
    emailMeCode: 'Email me a code',
    emailMeCodeInstead: 'Email me a code instead',
    sendNewCode: 'Send a new code',

    // Categories and tags
    colorLabel: 'Color {color}',
    addCategory: 'Add category',
    name: 'Name',
    add: 'Add',
    save: 'Save',
    rename: 'Rename',
    usedBy: 'Used by {n} recipes',
    noTags: 'No tags yet. Add tags to a recipe and they’ll show up here.',

    // Choose a username
    chooseTitle: 'Pick your username',
    chooseHint: 'It’s how your recipes are signed. Letters, numbers, dots, dashes or underscores.',

    // Settings
    signedInAs: 'Signed in as',
    signOut: 'Sign out',
    peopleTitle: 'People with access',
    joined: 'Added {date}',
    disabled: 'Disabled',
    stateActive: 'Active',
    stateInvited: 'Invited',
    recipeCount: '{n} recipes',
    recipeCountOne: '1 recipe',
    inviteTitle: 'Invite someone',
    inviteHint: 'Enter their email. They’ll sign in with it.',
    email: 'Email',
    invite: 'Invite',
    inviting: 'Inviting…',
    invited: '{email} can sign in now.',
    sendInvite: 'Send invitation',
    inviteCopied: 'Invitation copied',
    inviteMessage:
      'You’re invited to Recipe Book.\n\n1. Open {url}\n2. Sign in with your email: {email}\n3. Choose “Email me a code instead” and enter the code from your inbox\n4. Accept the “Add a passkey” banner — after that, signing in is just Face ID or your fingerprint',
    inviteAnother: 'Invite someone else',

    // Redesign: header menu, search field, detail menu and multiplier, settings
    add: 'Add',
    editCategories: 'Edit categories',
    editTags: 'Edit tags',
    searchWithin: 'Search within',
    removeFilter: 'Remove {label}',
    done: 'Done',
    clearAll: 'Clear all',
    clearFilters: 'Clear filters',
    matchCount: '{shown} of {total}',
    noMatchHint: 'Try another word, or clear the filters.',
    moreActions: 'More actions',
    serves: 'Serves {n}',
    customMultiplier: 'Custom multiplier',
    multiplier: 'Multiplier',
    decreaseMultiplier: 'Decrease multiplier',
    increaseMultiplier: 'Increase multiplier',
    apply: 'Apply',
    organise: 'Organise',
    categoryCount: '{n} categories',
    tagCount: '{n} tags',
  },
  fr: {
    appName: 'Livre de recettes',
    language: 'Langue',
    languageFrom_en: 'de l’anglais',
    languageFrom_fr: 'du français',

    categories: 'Catégories',
    tags: 'Étiquettes',
    settings: 'Réglages',
    signIn: 'Se connecter',
    passkeyOffer:
      'Ajoutez une clé d’accès pour vous connecter avec Face ID ou votre empreinte la prochaine fois.',
    addPasskey: 'Ajouter une clé d’accès',
    notNow: 'Plus tard',
    loading: 'Chargement…',
    loadError: 'Impossible de charger les recettes : {error}',
    recipeMissing: 'Cette recette n’existe pas (ou plus).',

    searchPlaceholder: 'Rechercher des recettes, ingrédients…',
    all: 'Toutes',
    filters: 'Filtres',
    byPerson: 'Ajoutée par',
    ingredient: 'Ingrédient',
    ingredientPlaceholder: 'ex. campari',
    findGood: 'Trouve-moi quelque chose de bon',
    noMatch: 'Rien ne correspond',
    showing: '{shown} sur {total} affichées. Cherchez ou filtrez pour trouver les autres.',

    back: 'Retour',
    share: 'Partager',
    duplicate: 'Dupliquer',
    duplicating: 'Duplication…',
    edit: 'Modifier',
    linkCopied: 'Lien copié',
    shareFailed: 'Partage impossible',
    ingredients: 'Ingrédients',
    scaleRecipe: 'Ajuster la recette',
    instructions: 'Instructions',
    notes: 'Notes',
    addedBy: 'Ajoutée par {name} · {date}',
    translatedFrom: 'Traduit {language}',
    translationStale: 'L’original a été modifié depuis cette traduction',
    translationPending: 'Pas encore traduit',
    translate: 'Traduire',
    translating: 'Traduction…',

    editRecipe: 'Modifier la recette',
    newRecipeTitle: 'Nouvelle recette',
    importFound: '{n} recettes trouvées — choisissez-en une',
    importTitle: 'Importer depuis un lien, un texte ou une photo',
    importUrlPlaceholder: 'Lien vers une page de recette ou une conversation Claude',
    extractUrl: 'Extraire depuis le lien',
    importTextPlaceholder: '…ou collez le texte de la recette ici',
    extractText: 'Extraire depuis le texte',
    extractPhotos: 'Extraire depuis des photos',
    readingPage: 'Lecture de la page…',
    readingText: 'Lecture de votre texte…',
    readingPhoto: 'Lecture de votre photo…',
    readingPhotos: 'Lecture de {n} photos…',
    importWait: 'cela peut prendre jusqu’à une minute',
    importUnreachable: 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.',
    importServerDied:
      'Le serveur a cessé de répondre (erreur {status}). Il a peut-être manqué de temps pour lire cette page — réessayez, ou collez le texte de la recette.',
    importUnknown: 'L’import a échoué pour une raison inconnue.',
    title: 'Titre',
    summary: 'Résumé',
    summaryPlaceholder: 'Une ligne sur cette recette',
    servings: 'Portions',
    servingsPlaceholder: 'ex. 4',
    category: 'Catégorie',
    none: 'Aucune',
    tagsHint: 'appuyez sur Entrée après chacune',
    tagPlaceholder: 'ex. Sauces pour ailes',
    removeTag: 'Retirer l’étiquette {tag}',
    photo: 'Photo',
    replacePhoto: 'Remplacer la photo',
    addPhoto: 'Ajouter une photo',
    remove: 'Retirer',
    onePerLine: 'un par ligne',
    onePerStep: 'une étape par ligne',
    ingredientsPlaceholder: '250 g de farine\n2 œufs',
    instructionsPlaceholder: 'Mélanger le tout.\nCuire à 190 °C.',
    notesHint: 'astuces, substitutions, tout ce qui aide',
    notesPlaceholder:
      'ex. Se double très bien. Remplacez le beurre par de l’huile pour une version sans lait.',
    cancel: 'Annuler',
    saving: 'Enregistrement…',
    saveRecipe: 'Enregistrer la recette',
    delete: 'Supprimer',
    deleteTitle: 'Supprimer « {title} » ?',
    deleteMessage: 'Cette action est irréversible.',

    loginName: 'E-mail ou nom d’utilisateur',
    devHint: 'Mode dev : n’importe quel nom vous connecte, les écritures sont faites par « dev ».',
    emailCode: 'Code reçu par e-mail',
    signingIn: 'Connexion…',
    signInPasskey: 'Se connecter avec une clé d’accès',
    emailMeCode: 'Envoyez-moi un code par e-mail',
    emailMeCodeInstead: 'Recevoir plutôt un code par e-mail',
    sendNewCode: 'Envoyer un nouveau code',

    colorLabel: 'Couleur {color}',
    addCategory: 'Ajouter une catégorie',
    name: 'Nom',
    add: 'Ajouter',
    save: 'Enregistrer',
    rename: 'Renommer',
    usedBy: 'Utilisée par {n} recettes',
    noTags: 'Aucune étiquette pour l’instant. Ajoutez-en à une recette et elles apparaîtront ici.',

    chooseTitle: 'Choisissez votre nom d’utilisateur',
    chooseHint:
      'C’est ainsi que vos recettes seront signées. Lettres, chiffres, points, tirets ou tirets bas.',

    signedInAs: 'Connecté en tant que',
    signOut: 'Se déconnecter',
    peopleTitle: 'Qui a accès',
    joined: 'Ajouté·e le {date}',
    disabled: 'Désactivé',
    stateActive: 'Actif·ve',
    stateInvited: 'Invité·e',
    recipeCount: '{n} recettes',
    recipeCountOne: '1 recette',
    inviteTitle: 'Inviter quelqu’un',
    inviteHint: 'Saisissez leur e-mail. Ils se connecteront avec.',
    email: 'E-mail',
    invite: 'Inviter',
    inviting: 'Invitation…',
    invited: '{email} peut maintenant se connecter.',
    sendInvite: 'Envoyer l’invitation',
    inviteCopied: 'Invitation copiée',
    inviteMessage:
      'Vous êtes invité·e sur Livre de recettes.\n\n1. Ouvrez {url}\n2. Connectez-vous avec votre e-mail : {email}\n3. Choisissez « Recevoir plutôt un code par e-mail » et saisissez le code reçu\n4. Acceptez la bannière « Ajouter une clé d’accès » — ensuite, la connexion se fait simplement par Face ID ou empreinte',
    inviteAnother: 'Inviter quelqu’un d’autre',

    add: 'Ajouter',
    editCategories: 'Modifier les catégories',
    editTags: 'Modifier les étiquettes',
    searchWithin: 'Rechercher dans les résultats',
    removeFilter: 'Retirer {label}',
    done: 'OK',
    clearAll: 'Tout effacer',
    clearFilters: 'Effacer les filtres',
    matchCount: '{shown} sur {total}',
    noMatchHint: 'Essayez un autre mot, ou effacez les filtres.',
    moreActions: 'Plus d’actions',
    serves: 'Pour {n}',
    customMultiplier: 'Multiplicateur personnalisé',
    multiplier: 'Multiplicateur',
    decreaseMultiplier: 'Diminuer le multiplicateur',
    increaseMultiplier: 'Augmenter le multiplicateur',
    apply: 'Appliquer',
    organise: 'Organiser',
    categoryCount: '{n} catégories',
    tagCount: '{n} étiquettes',
  },
};

export function detectLanguage(navigatorLanguage, stored) {
  if (LANGUAGES.includes(stored)) return stored;
  return String(navigatorLanguage ?? '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function loadLanguage() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveLanguage(lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // private mode or blocked storage: the choice just won't persist
  }
}

// Unknown keys fall back to English, then to the key itself, so a missing
// string is visible rather than blank.
export function translate(strings, lang, key, vars = {}) {
  const template = strings[lang]?.[key] ?? strings.en?.[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match,
  );
}

const TRANSLATABLE = ['title', 'summary', 'servings', 'ingredients', 'instructions', 'notes'];

// The recipe as the reader should see it in `lang`. `original` is the recipe
// exactly as given, because the edit form must work on the source fields.
export function localizeRecipe(recipe, lang) {
  const foreign = recipe.language !== lang;
  const found = foreign ? recipe.translations?.[lang] : undefined;
  const localized = { ...recipe };
  if (found) {
    for (const field of TRANSLATABLE) localized[field] = found[field] ?? recipe[field];
  }
  return {
    ...localized,
    original: recipe,
    translation: {
      shown: found ? 'translated' : 'source',
      stale: Boolean(found?.stale),
      pending: foreign && !found,
    },
  };
}

// The language a recipe is shown in: the reader's own pick for this recipe if
// they made one, else their default when the recipe has it, else its source.
export function recipeLanguage(recipe, preferred, override) {
  if (override) return override;
  return recipe.language === preferred || recipe.translations?.[preferred]
    ? preferred
    : recipe.language;
}
