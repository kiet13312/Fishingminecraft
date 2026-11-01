import { world, EntityComponentTypes } from "@minecraft/server";

const FISH_ID = "fishingmc:titan_dragon_fish";
const DAMAGE_PER_REEL = 2471281;
const MAX_DISTANCE = 72;
const USE_COOLDOWN_MS = 450;
const lastUse = new Map();

function nearbyFish(player) {
  try {
    return player.dimension.getEntities({
      type: FISH_ID,
      location: player.location,
      maxDistance: MAX_DISTANCE
    });
  } catch {
    return [];
  }
}

function isWater(block) {
  return !!block && (
    block.typeId === "minecraft:water" ||
    block.typeId === "minecraft:flowing_water"
  );
}

function findWaterSpot(player) {
  const dim = player.dimension;
  const origin = player.location;
  const view = player.getViewDirection();

  // Search along the direction the player is looking.
  for (let distance = 5; distance <= 14; distance += 1) {
    const cx = Math.floor(origin.x + view.x * distance);
    const cy = Math.floor(origin.y + view.y * distance - 1);
    const cz = Math.floor(origin.z + view.z * distance);

    for (let oy = 2; oy >= -3; oy--) {
      for (let ox = -2; ox <= 2; ox++) {
        for (let oz = -2; oz <= 2; oz++) {
          try {
            const block = dim.getBlock({ x: cx + ox, y: cy + oy, z: cz + oz });
            if (isWater(block)) {
              return { x: cx + ox + 0.5, y: cy + oy + 1.2, z: cz + oz + 0.5 };
            }
          } catch {
            // Skip invalid or unloaded positions.
          }
        }
      }
    }
  }

  // Fallback for players standing at the edge of a pond.
  const px = Math.floor(origin.x);
  const py = Math.floor(origin.y);
  const pz = Math.floor(origin.z);
  for (let radius = 2; radius <= 9; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        for (let dy = 1; dy >= -4; dy--) {
          try {
            const block = dim.getBlock({ x: px + dx, y: py + dy, z: pz + dz });
            if (isWater(block)) {
              return { x: px + dx + 0.5, y: py + dy + 1.2, z: pz + dz + 0.5 };
            }
          } catch {
            // Skip invalid positions.
          }
        }
      }
    }
  }
  return undefined;
}

function formatNumber(value) {
  return Math.max(0, Math.floor(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

world.afterEvents.itemUse.subscribe((event) => {
  const player = event.source;
  const stack = event.itemStack;

  if (!player || player.typeId !== "minecraft:player" || !stack) return;
  if (stack.typeId !== "minecraft:fishing_rod") return;

  const now = Date.now();
  const previous = lastUse.get(player.id) ?? 0;
  if (now - previous < USE_COOLDOWN_MS) return;
  lastUse.set(player.id, now);

  const active = nearbyFish(player).filter((entity) => {
    try { return entity.isValid(); } catch { return false; }
  });

  if (active.length === 0) {
    const water = findWaterSpot(player);
    if (!water) {
      player.sendMessage("§b[Câu Cá Vạn Cân] §fHãy đứng cạnh hồ/biển, ngắm vào mặt nước rồi thả cần câu.");
      return;
    }

    try {
      const fish = player.dimension.spawnEntity(FISH_ID, water);
      const rotation = player.getRotation();
      fish.setRotation({ x: 0, y: rotation.y + 180 });
      player.dimension.playSound("random.splash", water, { volume: 1.0, pitch: 0.65 });
      player.sendMessage("§6§lTITAN DRAGON FISH!§r §eMột thủy quái 100.000.000 HP đã cắn câu!");
      player.sendMessage("§7Dùng cần câu lần nữa để kéo cá, mỗi nhịp gây §c2.471.281 sát thương§7.");
    } catch {
      player.sendMessage("§cKhông thể gọi cá tại vị trí này. Hãy thử ở vùng nước rộng hơn.");
    }
    return;
  }

  const fish = active[0];
  try {
    const applied = fish.applyDamage(DAMAGE_PER_REEL);
    const health = fish.getComponent(EntityComponentTypes.Health);
    const remaining = health ? health.currentValue : 0;

    player.dimension.playSound("random.splash", fish.location, { volume: 0.85, pitch: 0.85 });
    if (remaining > 0) {
      player.sendMessage(`§bKÉO CÁ! §f-${formatNumber(DAMAGE_PER_REEL)} HP §7| Còn lại: §c${formatNumber(remaining)} HP`);
    } else {
      player.sendMessage("§6§lĐÃ CHINH PHỤC TITAN DRAGON FISH!§r §eNhận 3–7 Vảy Rồng từ phần thưởng.");
      try { fish.kill(); } catch {}
    }
    if (!applied && remaining > 0) {
      player.sendMessage("§cCá không nhận sát thương ở nhịp này. Hãy thử kéo cần lại.");
    }
  } catch {
    player.sendMessage("§cDây câu bị tuột! Hãy thử thả cần lại.");
  }
});
