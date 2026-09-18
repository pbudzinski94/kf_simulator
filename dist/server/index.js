const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

const WEAPON_SELECT = `
  SELECT
    id,
    name,
    attack_dice AS attackDice,
    attack_bonus AS attackBonus,
    bonus_damage AS bonusDamage,
    per_hit_red AS perHitRed,
    per_hit_black AS perHitBlack,
    per_hit_white AS perHitWhite,
    extra_dice_red AS extraDiceRed,
    extra_dice_black AS extraDiceBlack,
    extra_dice_white AS extraDiceWhite,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM weapons`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function integer(value, field, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Pole ${field} musi być liczbą całkowitą od ${min} do ${max}.`);
  }
  return value;
}

function validateWeapon(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Brak danych broni.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 100) throw new Error('Nazwa broni musi mieć od 1 do 100 znaków.');
  return {
    name,
    attackDice: integer(input.attackDice, 'Liczba kości ataku', 0, 20),
    attackBonus: integer(input.attackBonus, 'Bonus do wyniku', -20, 20),
    bonusDamage: integer(input.bonusDamage, 'Stałe dodatkowe obrażenia', 0, 50),
    perHit: {
      red: integer(input.perHit?.red, 'Czerwone Power za trafienie', 0, 20),
      black: integer(input.perHit?.black, 'Czarne Power za trafienie', 0, 20),
      white: integer(input.perHit?.white, 'Białe Power za trafienie', 0, 20)
    },
    extraDice: {
      red: integer(input.extraDice?.red, 'Dodatkowe czerwone Power', 0, 20),
      black: integer(input.extraDice?.black, 'Dodatkowe czarne Power', 0, 20),
      white: integer(input.extraDice?.white, 'Dodatkowe białe Power', 0, 20)
    }
  };
}

function weaponFromRow(row) {
  return {
    id: row.id, name: row.name, attackDice: row.attackDice, attackBonus: row.attackBonus,
    bonusDamage: row.bonusDamage,
    perHit: { red: row.perHitRed, black: row.perHitBlack, white: row.perHitWhite },
    extraDice: { red: row.extraDiceRed, black: row.extraDiceBlack, white: row.extraDiceWhite },
    createdAt: row.createdAt, updatedAt: row.updatedAt
  };
}

async function listWeapons(db) {
  const result = await db.prepare(`${WEAPON_SELECT} ORDER BY name COLLATE NOCASE`).all();
  return (result.results || []).map(weaponFromRow);
}

async function saveWeapon(db, weapon) {
  await db.prepare(`
    INSERT INTO weapons (
      name, attack_dice, attack_bonus, bonus_damage,
      per_hit_red, per_hit_black, per_hit_white,
      extra_dice_red, extra_dice_black, extra_dice_white
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      attack_dice = excluded.attack_dice,
      attack_bonus = excluded.attack_bonus,
      bonus_damage = excluded.bonus_damage,
      per_hit_red = excluded.per_hit_red,
      per_hit_black = excluded.per_hit_black,
      per_hit_white = excluded.per_hit_white,
      extra_dice_red = excluded.extra_dice_red,
      extra_dice_black = excluded.extra_dice_black,
      extra_dice_white = excluded.extra_dice_white,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    weapon.name, weapon.attackDice, weapon.attackBonus, weapon.bonusDamage,
    weapon.perHit.red, weapon.perHit.black, weapon.perHit.white,
    weapon.extraDice.red, weapon.extraDice.black, weapon.extraDice.white
  ).run();
  const row = await db.prepare(`${WEAPON_SELECT} WHERE name = ? COLLATE NOCASE`).bind(weapon.name).first();
  return weaponFromRow(row);
}

async function handleApi(request, env, url) {
  if (url.pathname !== '/api/weapons') return json({ error: 'Nie znaleziono endpointu.' }, 404);
  if (!env.DB) return json({ error: 'Binding D1 „DB” nie jest skonfigurowany.' }, 503);
  if (request.method === 'GET') return json({ weapons: await listWeapons(env.DB) });
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); }
    catch (_) { return json({ error: 'Nieprawidłowy JSON.' }, 400); }
    try {
      const weapon = validateWeapon(body);
      return json({ weapon: await saveWeapon(env.DB, weapon) }, 201);
    } catch (error) {
      return json({ error: error.message || 'Nie udało się zapisać broni.' }, 400);
    }
  }
  return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await handleApi(request, env, url); }
      catch (error) {
        console.error('Weapons API error', error);
        return json({ error: 'Błąd bazy danych. Sprawdź migrację D1.' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};

export { handleApi, listWeapons, saveWeapon, validateWeapon, weaponFromRow };
export default worker;
