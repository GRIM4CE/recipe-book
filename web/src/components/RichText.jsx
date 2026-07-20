import { tokenizeLinks } from '../linkify.js';

// Renders recipe prose with links: external URLs open in a new tab; mentions of
// other recipes by title jump to that recipe's card.
export default function RichText({ text, recipes = [], excludeId = null }) {
  return tokenizeLinks(text, recipes, excludeId).map((tok, i) => {
    if (tok.type === 'url') {
      return (
        <a key={i} href={tok.href} target="_blank" rel="noopener noreferrer">
          {tok.value}
        </a>
      );
    }
    if (tok.type === 'recipe') {
      return (
        <a key={i} className="recipe-link" href={`#/recipes/${tok.id}`}>
          {tok.value}
        </a>
      );
    }
    return tok.value;
  });
}
