import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/db.js";

const config = loadConfig();
if (config.dbUrl.startsWith("file:")) mkdirSync("./data", { recursive: true });
const client = createClient({
  url: config.dbUrl,
  ...(config.dbAuthToken ? { authToken: config.dbAuthToken } : {}),
});
const db = createDb(client);

await db.applySchema();

if ((await db.listRecipes()).length > 0) {
  console.log("Database already has recipes; leaving it alone.");
  process.exit(0);
}

const palette: Array<[string, string]> = [
  ["Breakfast", "#F2A93B"],
  ["Dinner", "#E85D4C"],
  ["Dessert", "#E8618C"],
  ["Drinks", "#4C9BE8"],
  ["Sides", "#58B368"],
];
const categories = new Map<string, number>();
for (const [name, color] of palette) {
  const existing = await db.getCategoryByName(name);
  const cat = existing ?? (await db.createCategory({ name, color }));
  categories.set(name, cat.id);
}

const recipes: Array<{
  title: string;
  summary: string;
  category: string;
  ingredients: string[];
  instructions: string[];
  tags?: string[];
}> = [
  {
    title: "Buttermilk Pancakes",
    summary: "Tall, fluffy weekend pancakes with crispy edges.",
    category: "Breakfast",
    ingredients: [
      "2 cups flour",
      "2 tbsp sugar",
      "2 tsp baking powder",
      "1 tsp baking soda",
      "1/2 tsp salt",
      "2 cups buttermilk",
      "2 eggs",
      "4 tbsp melted butter",
    ],
    instructions: [
      "Whisk the dry ingredients together.",
      "Whisk buttermilk, eggs, and butter in a second bowl.",
      "Fold wet into dry — lumps are fine, don't overmix.",
      "Cook on a buttered griddle over medium heat until bubbles pop, then flip.",
    ],
  },
  {
    title: "Sunday Bolognese",
    summary: "Slow-simmered ragù for a lazy afternoon.",
    category: "Dinner",
    tags: ["Pasta", "Slow Cooked"],
    ingredients: [
      "1 lb ground beef",
      "1/2 lb ground pork",
      "1 onion, diced",
      "1 carrot, diced",
      "1 celery stalk, diced",
      "3 cloves garlic",
      "2 tbsp tomato paste",
      "1 cup dry white wine",
      "28 oz crushed tomatoes",
      "1 cup whole milk",
    ],
    instructions: [
      "Brown the meats hard; remove.",
      "Sweat onion, carrot, and celery until soft; add garlic and tomato paste.",
      "Deglaze with wine, return meat, add tomatoes.",
      "Simmer 2–3 hours, adding milk in the last 30 minutes.",
      "Toss with tagliatelle and plenty of parmesan.",
    ],
  },
  {
    title: "Weeknight Chicken Tikka",
    summary: "Yogurt-marinated chicken under the broiler, sauce in one pan.",
    category: "Dinner",
    ingredients: [
      "1.5 lb chicken thighs",
      "1 cup yogurt",
      "2 tbsp garam masala",
      "1 tbsp grated ginger",
      "4 cloves garlic",
      "28 oz tomato purée",
      "1/2 cup heavy cream",
      "Cilantro to finish",
    ],
    instructions: [
      "Marinate chicken in yogurt, half the spices, ginger, and garlic (20 min to overnight).",
      "Broil chicken on a rack until charred at the edges.",
      "Simmer tomato purée with remaining spices; add cream.",
      "Chop chicken into the sauce and simmer 5 minutes; top with cilantro.",
    ],
  },
  {
    title: "Brown Butter Chocolate Chip Cookies",
    summary: "Nutty, chewy, slightly oversized. The house cookie.",
    category: "Dessert",
    ingredients: [
      "1 cup butter, browned and cooled",
      "1 cup brown sugar",
      "1/2 cup white sugar",
      "2 eggs",
      "2 1/4 cups flour",
      "1 tsp baking soda",
      "1 tsp flaky salt",
      "8 oz chopped dark chocolate",
    ],
    instructions: [
      "Brown the butter; let it cool until just warm.",
      "Beat butter with both sugars, then beat in eggs.",
      "Fold in flour, baking soda, and chocolate.",
      "Rest the dough overnight in the fridge.",
      "Bake at 375°F for 11–12 minutes; salt on exit.",
    ],
  },
  {
    title: "Overnight Oats",
    summary: "Assemble tonight, breakfast appears tomorrow.",
    category: "Breakfast",
    ingredients: [
      "1/2 cup rolled oats",
      "1/2 cup milk",
      "1/4 cup yogurt",
      "1 tbsp chia seeds",
      "1 tbsp maple syrup",
      "Berries and nuts to top",
    ],
    instructions: [
      "Stir everything but the toppings in a jar.",
      "Refrigerate overnight.",
      "Top with berries and nuts before eating.",
    ],
  },
  {
    title: "Classic Negroni",
    summary: "Equal parts, no debate. Stirred, never shaken.",
    category: "Drinks",
    ingredients: [
      "1 oz gin",
      "1 oz Campari",
      "1 oz sweet vermouth",
      "Orange peel",
    ],
    instructions: [
      "Stir all three over ice for 20 seconds.",
      "Strain over a big cube.",
      "Express the orange peel over the top and drop it in.",
    ],
  },
  {
    title: "Whiskey Sour",
    summary: "Fresh lemon or nothing. Egg white optional but encouraged.",
    category: "Drinks",
    ingredients: [
      "2 oz bourbon",
      "3/4 oz lemon juice",
      "1/2 oz simple syrup",
      "1 egg white (optional)",
      "Angostura bitters",
    ],
    instructions: [
      "Dry shake everything without ice (if using egg white).",
      "Shake again with ice.",
      "Strain into a rocks glass over ice; dash bitters on the foam.",
    ],
  },
  {
    title: "Garlic Smashed Potatoes",
    summary: "Boiled, smashed, and roasted until shatteringly crisp.",
    category: "Sides",
    tags: ["Grill Out"],
    ingredients: [
      "1.5 lb baby potatoes",
      "4 tbsp olive oil",
      "4 cloves garlic, grated",
      "Rosemary",
      "Flaky salt",
    ],
    instructions: [
      "Boil potatoes in salty water until fork-tender.",
      "Smash flat on an oiled sheet pan.",
      "Brush with garlic oil and rosemary.",
      "Roast at 450°F until deeply browned, ~25 minutes.",
    ],
  },
];

for (const r of recipes) {
  await db.createRecipe(
    {
      title: r.title,
      summary: r.summary,
      ingredients: r.ingredients,
      instructions: r.instructions,
      categoryId: categories.get(r.category),
      tags: r.tags,
    },
    { createdBy: "dev", source: "web" },
  );
}

console.log(
  `Seeded ${palette.length} categories and ${recipes.length} recipes into ${config.dbUrl}`,
);
