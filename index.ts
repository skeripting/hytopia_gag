/**
 * HYTOPIA SDK Boilerplate
 *
 * This is a simple boilerplate to get started on your project.
 * It implements the bare minimum to be able to run and connect
 * to your game server and run around as the basic player entity.
 *
 * From here you can begin to implement your own game logic
 * or do whatever you want!
 *
 * You can find documentation here: https://github.com/hytopiagg/sdk/blob/main/docs/server.md
 *
 * For more in-depth examples, check out the examples folder in the SDK, or you
 * can find it directly on GitHub: https://github.com/hytopiagg/sdk/tree/main/examples/payload-game
 *
 * You can officially report bugs or request features here: https://github.com/hytopiagg/sdk/issues
 *
 * To get help, have found a bug, or want to chat with
 * other HYTOPIA devs, join our Discord server:
 * https://discord.gg/DXCXJbHSJX
 *
 * Official SDK Github repo: https://github.com/hytopiagg/sdk
 * Official SDK NPM Package: https://www.npmjs.com/package/hytopia
 */

import {
  startServer,
  Audio,
  DefaultPlayerEntity,
  PlayerEvent,
  Entity,
  EntityEvent,
  BaseEntityControllerEvent,
  PlayerUIEvent,
  RigidBodyType,
  Vector3,
} from "hytopia";
import type { RaycastHit } from "hytopia";

import worldMap from "./assets/map.json";

// Add inventory system
const playerInventories = new Map<string, string[]>();
const playerHeldItems = new Map<string, Entity | null>();
const playerHeldItemNames = new Map<string, string | null>();

// Add cash system
const playerCash = new Map<string, number>();

// Add garden ownership system
const gardenOwnership = new Map<string, string>(); // gardenId -> playerId
const playerGardens = new Map<string, string[]>(); // playerId -> gardenIds[]

// Add garden indexing system
const gardenIndices = new Map<string, number>(); // gardenId -> gardenIndex
let nextGardenIndex = 1; // Next available garden index

// Add to the raycast data type
type RaycastData = {
  lookingAtDirt: boolean;
  heldItem: string | null;
  closestDirtPos: { x: number; y: number; z: number } | null;
  nearbyPlant: {
    name: string;
    position: { x: number; y: number; z: number };
  } | null;
  plantProgress: number;
  isPlantFullyGrown: boolean;
  nearbyGarden: {
    id: string;
    position: { x: number; y: number; z: number };
    isOwned: boolean;
    ownerId: string | null;
    gardenOwnerDisplay: string | null;
    gardenIndex: number | null; // Add garden index
  } | null;
};

// Update the playerRaycastData map type
const playerRaycastData = new Map<string, RaycastData>();

// Update the GrowingSeed type to be more specific
type GrowingSeed = {
  entity: Entity;
  startTime: number;
  startScale: number;
  endScale: number;
  startY: number;
  endY: number;
  plantPos: { x: number; y: number; z: number };
  plantName: string;
};

// Update the growingSeeds map with the new type
const growingSeeds = new Map<string, GrowingSeed>();

// Add type definition for plant types
type PlantType = {
  name: string;
  seedModel: string;
  plantModel: string;
  seedScale: number;
  plantScale: number;
  growthTime: number;
  finalHeight: number;
  color: string;
  emoji: string;
  cost: number;
  sellPrice: number;
};

type PlantTypes = {
  [key: string]: PlantType;
};

const PLANT_TYPES: PlantTypes = {
  "carrot-seed": {
    name: "Carrot Seed",
    seedModel: "models/items/stick.gltf",
    plantModel: "models/items/carrot.gltf",
    seedScale: 0.3,
    plantScale: 1.2,
    growthTime: 4000, // 4 seconds
    finalHeight: 0.5,
    color: "FFA500", // Orange
    emoji: "🥕",
    cost: 10, // 10 cash
    sellPrice: 15, // 15 cash
  },
  "melon-seed": {
    name: "Melon Seed",
    seedModel: "models/items/stick.gltf",
    plantModel: "models/items/melon.gltf",
    seedScale: 0.3,
    plantScale: 1.5,
    growthTime: 30000, // 30 seconds
    finalHeight: 0.3,
    color: "00FF00", // Green
    emoji: "🍈",
    cost: 25, // 25 cash
    sellPrice: 30, // 30 cash
  },
  "potato-seed": {
    name: "Potato Seed",
    seedModel: "models/items/stick.gltf",
    plantModel: "models/items/potato.gltf", // Using bone as placeholder
    seedScale: 0.3,
    plantScale: 0.8,
    growthTime: 60000, // 60 seconds
    finalHeight: 0.6,
    color: "8B4513", // Brown
    emoji: "🥔",
    cost: 15, // 15 cash
    sellPrice: 20, // 20 cash
  },
  "cookie-seed": {
    name: "Cookie Seed",
    seedModel: "models/items/stick.gltf",
    plantModel: "models/items/cookie.gltf", // Using map as placeholder
    seedScale: 0.3,
    plantScale: 2.0,
    growthTime: 75000, // 75 seconds
    finalHeight: 1.5,
    color: "8B4513", // Gold
    emoji: "🍪",
    cost: 50, // 50 cash
    sellPrice: 60, // 60 cash
  },
} as const;

// Create seed item entity
const createSeedItem = () => {
  return new Entity({
    modelUri: "models/items/stick.gltf", // Using stick model as placeholder for seeds
    modelScale: 0.3, // Make it smaller since it's a seed
    rigidBodyOptions: {
      enabled: false, // Disable physics completely
    },
  });
};

// Function to update player's inventory UI
const updatePlayerInventoryUI = (
  player: any,
  world: any,
  heldItemIndex: number | null = null
) => {
  const inventory = playerInventories.get(player.id) || [];
  // Pad inventory to 9 slots
  const paddedInventory = [
    ...inventory,
    ...Array(9 - inventory.length).fill(null),
  ];

  // Send inventory data through chat system with held item info
  player.ui.sendData({
    type: "inventory_update",
    inventory: paddedInventory,
    heldItemIndex: heldItemIndex,
  });
};

// Add this helper function for linear interpolation
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

// Helper function to generate garden ID from position
function getGardenId(x: number, y: number, z: number): string {
  return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
}

// Helper function to check if a position is within a garden boundary
function isWithinGarden(x: number, y: number, z: number): boolean {
  // Define garden boundaries (you can adjust these based on your map)
  // For now, let's assume gardens are 5x5 areas with wood perimeter
  const gardenSize = 5;
  const gardenSpacing = 10; // Space between gardens

  // Check if position is within a garden grid
  const gridX = Math.floor(x / gardenSpacing);
  const gridZ = Math.floor(z / gardenSpacing);

  // Check if position is within the garden area (not on the perimeter)
  const localX = x % gardenSpacing;
  const localZ = z % gardenSpacing;

  return (
    localX >= 1 &&
    localX < gardenSize - 1 &&
    localZ >= 1 &&
    localZ < gardenSize - 1 &&
    y >= 9 &&
    y <= 11
  ); // Garden height range
}

// Helper function to check if a position is within a claimed garden
function getGardenOwnerForPosition(
  x: number,
  y: number,
  z: number
): string | null {
  // Check all claimed gardens to see if this position is within any of them
  for (const [gardenId, ownerId] of gardenOwnership.entries()) {
    // Parse the garden bounds from the ID (format: "minX,maxX,minZ,maxZ,y")
    const parts = gardenId.split(",");
    if (parts.length === 5) {
      const minX = parseInt(parts[0] || "0");
      const maxX = parseInt(parts[1] || "0");
      const minZ = parseInt(parts[2] || "0");
      const maxZ = parseInt(parts[3] || "0");
      const gardenY = parseInt(parts[4] || "0");

      // Check if position is within this garden's bounds
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ && y === gardenY) {
        return ownerId;
      }
    }
  }
  return null;
}

// Helper to find garden bounds and validate perimeter (perimeter-only, allow 3-block entrance on one side, do not check inside)
function findGardenBoundsAndValidate(
  world: any,
  x: number,
  y: number,
  z: number
): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  valid: boolean;
} | null {
  // Find the nearest rectangle of logs around (x, z) at height y
  // Expand outwards until we hit logs in all four directions
  let minX = x,
    maxX = x,
    minZ = z,
    maxZ = z;
  // Expand X-
  while (world.chunkLattice.getBlockId({ x: minX - 1, y, z }) === 42) minX--;
  // Expand X+
  while (world.chunkLattice.getBlockId({ x: maxX + 1, y, z }) === 42) maxX++;
  // Expand Z-
  while (world.chunkLattice.getBlockId({ x, y, z: minZ - 1 }) === 42) minZ--;
  // Expand Z+
  while (world.chunkLattice.getBlockId({ x, y, z: maxZ + 1 }) === 42) maxZ++;

  // Now check the perimeter
  let entranceSides = 0;
  function checkBorder(
    getX: (i: number) => number,
    getZ: (i: number) => number,
    start: number,
    end: number
  ): boolean {
    let gap = 0;
    let maxGap = 0;
    for (let i = start; i <= end; i++) {
      const blockId = world.chunkLattice.getBlockId({
        x: getX(i),
        y,
        z: getZ(i),
      });
      if (blockId !== 42) {
        gap++;
        maxGap = Math.max(maxGap, gap);
      } else {
        gap = 0;
      }
    }
    if (maxGap > 0) entranceSides++;
    return true;
  }
  // Top border (minZ)
  if (
    !checkBorder(
      (xi) => xi,
      (_) => minZ,
      minX,
      maxX
    )
  )
    return null;
  // Bottom border (maxZ)
  if (
    !checkBorder(
      (xi) => xi,
      (_) => maxZ,
      minX,
      maxX
    )
  )
    return null;
  // Left border (minX)
  if (
    !checkBorder(
      (_) => minX,
      (zi) => zi,
      minZ,
      maxZ
    )
  )
    return null;
  // Right border (maxX)
  if (
    !checkBorder(
      (_) => maxX,
      (zi) => zi,
      minZ,
      maxZ
    )
  )
    return null;
  if (entranceSides !== 1) return null; // Only one side can have a gap
  return { minX, maxX, minZ, maxZ, valid: true };
}

// Helper to get a unique garden ID from bounds
function getGardenIdFromBounds(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  y: number
): string {
  return `${minX},${maxX},${minZ},${maxZ},${y}`;
}

// Add garden boundary indicators
const gardenBoundaryIndicators = new Map<string, Entity[]>(); // gardenId -> array of indicator entities

// Function to create garden boundary indicators
function createGardenBoundaryIndicators(
  world: any,
  gardenId: string,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  y: number,
  ownerId: string
) {
  // Remove existing indicators for this garden
  const existingIndicators = gardenBoundaryIndicators.get(gardenId) || [];
  existingIndicators.forEach((indicator) => indicator.despawn());

  // Create new indicators
  const indicators: Entity[] = [];

  // Create corner indicators (small glowing blocks)
  const cornerPositions = [
    { x: minX, z: minZ },
    { x: maxX, z: minZ },
    { x: minX, z: maxZ },
    { x: maxX, z: maxZ },
  ];

  cornerPositions.forEach((pos, index) => {
    const indicator = new Entity({
      modelUri: "models/items/stick.gltf", // Using stick as placeholder
      modelScale: 0.3,
      rigidBodyOptions: {
        enabled: false,
      },
    });

    indicator.spawn(world, { x: pos.x, y: y + 2.0, z: pos.z });
    indicators.push(indicator);
  });

  // Create edge indicators (lines along the perimeter)
  const edgeIndicators = createEdgeIndicators(
    world,
    minX,
    maxX,
    minZ,
    maxZ,
    y,
    ownerId
  );
  indicators.push(...edgeIndicators);

  gardenBoundaryIndicators.set(gardenId, indicators);
}

// Function to create edge indicators
function createEdgeIndicators(
  world: any,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  y: number,
  ownerId: string
): Entity[] {
  const indicators: Entity[] = [];

  // Create indicators along the edges (every 2 blocks)
  for (let x = minX; x <= maxX; x += 2) {
    // Top edge
    const topIndicator = new Entity({
      modelUri: "models/items/stick.gltf",
      modelScale: 0.2,
      rigidBodyOptions: {
        enabled: false,
      },
    });
    topIndicator.spawn(world, { x: x, y: y + 1.8, z: minZ }); // Increased Y position from 0.3 to 1.8
    indicators.push(topIndicator);

    // Bottom edge
    const bottomIndicator = new Entity({
      modelUri: "models/items/stick.gltf",
      modelScale: 0.2,
      rigidBodyOptions: {
        enabled: false,
      },
    });
    bottomIndicator.spawn(world, { x: x, y: y + 1.8, z: maxZ }); // Increased Y position from 0.3 to 1.8
    indicators.push(bottomIndicator);
  }

  for (let z = minZ; z <= maxZ; z += 2) {
    // Left edge
    const leftIndicator = new Entity({
      modelUri: "models/items/stick.gltf",
      modelScale: 0.2,
      rigidBodyOptions: {
        enabled: false,
      },
    });
    leftIndicator.spawn(world, { x: minX, y: y + 1.8, z: z }); // Increased Y position from 0.3 to 1.8
    indicators.push(leftIndicator);

    // Right edge
    const rightIndicator = new Entity({
      modelUri: "models/items/stick.gltf",
      modelScale: 0.2,
      rigidBodyOptions: {
        enabled: false,
      },
    });
    rightIndicator.spawn(world, { x: maxX, y: y + 1.8, z: z }); // Increased Y position from 0.3 to 1.8
    indicators.push(rightIndicator);
  }

  return indicators;
}

// Function to remove garden boundary indicators
function removeGardenBoundaryIndicators(gardenId: string) {
  const indicators = gardenBoundaryIndicators.get(gardenId) || [];
  indicators.forEach((indicator) => indicator.despawn());
  gardenBoundaryIndicators.delete(gardenId);
}

// Function to update garden boundary indicators for all players
function updateGardenBoundaryIndicators(world: any) {
  // Remove all existing indicators
  gardenBoundaryIndicators.forEach((indicators, gardenId) => {
    indicators.forEach((indicator) => indicator.despawn());
  });
  gardenBoundaryIndicators.clear();

  // Recreate indicators for all claimed gardens
  gardenOwnership.forEach((ownerId, gardenId) => {
    const parts = gardenId.split(",");
    if (parts.length === 5) {
      const minX = parseInt(parts[0] || "0");
      const maxX = parseInt(parts[1] || "0");
      const minZ = parseInt(parts[2] || "0");
      const maxZ = parseInt(parts[3] || "0");
      const y = parseInt(parts[4] || "0");

      createGardenBoundaryIndicators(
        world,
        gardenId,
        minX,
        maxX,
        minZ,
        maxZ,
        y,
        ownerId
      );
    }
  });
}

// Function to reset garden indices (useful for testing)
function resetGardenIndices() {
  gardenIndices.clear();
  nextGardenIndex = 1;
}

// Function to get or assign garden index
function getOrAssignGardenIndex(gardenId: string): number {
  if (!gardenIndices.has(gardenId)) {
    gardenIndices.set(gardenId, nextGardenIndex);
    nextGardenIndex++;
  }
  return gardenIndices.get(gardenId) || 1;
}

/**
 * startServer is always the entry point for our game.
 * It accepts a single function where we should do any
 * setup necessary for our game. The init function is
 * passed a World instance which is the default
 * world created by the game server on startup.
 *
 * Documentation: https://github.com/hytopiagg/sdk/blob/main/docs/server.startserver.md
 */

startServer((world) => {
  /**
   * Enable debug rendering of the physics simulation.
   * This will overlay lines in-game representing colliders,
   * rigid bodies, and raycasts. This is useful for debugging
   * physics-related issues in a development environment.
   * Enabling this can cause performance issues, which will
   * be noticed as dropped frame rates and higher RTT times.
   * It is intended for development environments only and
   * debugging physics.
   */

  // world.simulation.enableDebugRendering(true);

  /**
   * Load our map.
   * You can build your own map using https://build.hytopia.com
   * After building, hit export and drop the .json file in
   * the assets folder as map.json.
   */
  world.loadMap(worldMap);

  // Initialize garden boundary indicators for any existing claimed gardens
  updateGardenBoundaryIndicators(world);

  /**
   * Handle player joining the game. The PlayerEvent.JOINED_WORLD
   * event is emitted to the world when a new player connects to
   * the game. From here, we create a basic player
   * entity instance which automatically handles mapping
   * their inputs to control their in-game entity and
   * internally uses our player entity controller.
   *
   * The HYTOPIA SDK is heavily driven by events, you
   * can find documentation on how the event system works,
   * here: https://dev.hytopia.com/sdk-guides/events
   */
  world.on(PlayerEvent.JOINED_WORLD, ({ player }) => {
    // Initialize player's inventory and held item
    playerInventories.set(player.id, []);
    playerHeldItems.set(player.id, null);
    playerHeldItemNames.set(player.id, null);

    // Initialize player's cash
    playerCash.set(player.id, 10);

    const playerEntity = new DefaultPlayerEntity({
      player,
      name: "Player",
    });

    playerEntity.spawn(world, { x: -65, y: 10, z: 10 });

    // Load UI and send initial inventory data
    player.ui.load("ui/index.html");
    updatePlayerInventoryUI(player, world);

    // Send initial cash data
    player.ui.sendData({
      type: "cash_update",
      cash: 10,
    });

    // Send a nice welcome message that only the player who joined will see ;)
    world.chatManager.sendPlayerMessage(
      player,
      "Welcome to Grow a Garden!",
      "00FF00"
    );
    world.chatManager.sendPlayerMessage(player, "Use WASD to move around.");
    world.chatManager.sendPlayerMessage(player, "Press space to jump.");
    world.chatManager.sendPlayerMessage(player, "Hold shift to sprint.");
    world.chatManager.sendPlayerMessage(
      player,
      "Talk to the NPC to get started!"
    );
    world.chatManager.sendPlayerMessage(
      player,
      "Press \\ to enter or exit debug view."
    );

    // Trying to spawn a skeleton entity
    const skeletonSeedSeller = new Entity({
      modelUri: "models/npcs/skeleton.gltf",
      modelLoopedAnimations: ["idle"],
      modelScale: 0.8,
      rigidBodyOptions: {},
    });

    // We need to make the entity rotate 90 degrees around the Y axis
    skeletonSeedSeller.setRotation({ x: 0, y: -Math.PI / 2, z: 0, w: 1 });
    // Just like the player entity, we can spawn the skeleton entity
    skeletonSeedSeller.spawn(world, { x: -74, y: 10, z: 10 });

    const SHALE = 65; // corner marker block-id
    const DIRT = 13; // centre marker block-id
    const LOG = 42;

    const searchRadius = 100; // how far around the player we scan for corners

    function looksLikeGardenCorner(
      bx: number,
      by: number,
      bz: number
    ): boolean {
      const radius = 10;
      // quick scan inwards → (+X) and (+Z) for DIRT
      for (let dx = 1; dx <= radius; dx++) {
        if (world.chunkLattice.getBlockId({ x: bx + dx, y: by, z: bz }) === LOG)
          return true;
      }
      return false;
    }

    // Update the dirt check interval to ensure progress data is being sent
    const dirtCheckInterval = setInterval(() => {
      const playerEntity =
        world.entityManager.getPlayerEntitiesByPlayer(player)[0];
      if (!playerEntity) return;

      // Get player's position
      const playerPos = playerEntity.position;

      // Convert player position to block coordinates (round down)
      const playerBlockX = Math.floor(playerPos.x);
      const playerBlockY = Math.floor(playerPos.y);
      const playerBlockZ = Math.floor(playerPos.z);

      // Check blocks and plants in a 3x3x3 area around the player
      let lookingAtDirt = false;
      let closestDirtPos = null;
      let minDistance = Infinity;
      const checkRadius = 2;

      // Check for nearby growing plants
      let nearbyPlant: RaycastData["nearbyPlant"] = null;
      let plantProgress = 0;
      let isPlantFullyGrown = false;

      // Check for dirt blocks
      for (let x = -checkRadius; x <= checkRadius; x++) {
        for (let y = -checkRadius; y <= checkRadius; y++) {
          for (let z = -checkRadius; z <= checkRadius; z++) {
            const blockX = playerBlockX + x;
            const blockY = playerBlockY + y;
            const blockZ = playerBlockZ + z;

            const blockType = world.chunkLattice.getBlockId({
              x: blockX,
              y: blockY,
              z: blockZ,
            });

            if (blockType === 13) {
              // 13 is dirt block
              const dx = blockX + 0.5 - playerPos.x;
              const dy = blockY + 0.5 - playerPos.y;
              const dz = blockZ + 0.5 - playerPos.z;
              const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

              if (distance <= 3) {
                lookingAtDirt = true;
                if (distance < minDistance) {
                  minDistance = distance;
                  closestDirtPos = { x: blockX, y: blockY, z: blockZ };
                }
              }
            }
          }
        }
      }

      // --- BEGIN GARDEN DETECTION v2 -------------------------------------------
      let nearbyGarden: RaycastData["nearbyGarden"] = null;

      let minGardenDistance = Infinity;

      /* 1.  Gather all shale “corner” blocks within the search cube. */
      const shaleCorners: { x: number; y: number; z: number }[] = [];
      for (let x = -searchRadius; x <= searchRadius; x++) {
        for (let y = -1; y <= 1; y++) {
          for (let z = -searchRadius; z <= searchRadius; z++) {
            const bx = playerBlockX + x;
            const by = playerBlockY + y;
            const bz = playerBlockZ + z;
            if (
              world.chunkLattice.getBlockId({ x: bx, y: by, z: bz }) === SHALE
            ) {
              console.log("Shale found at:");
              console.log(bx + ", " + by + ", " + bx);
              if (looksLikeGardenCorner(bx, 1, bz)) {
                shaleCorners.push({ x: bx, y: by, z: bz });
              }
            }
          }
        }
      }

      console.log(shaleCorners);

      /* 2.  Split by Y-level (gardens must all sit on one flat layer). */
      const cornersByY: Record<number, typeof shaleCorners> = {};
      for (const c of shaleCorners) {
        if (!cornersByY[c.y]) cornersByY[c.y] = [];
        cornersByY[c.y]!.push(c);
      }

      /* 3.  For every distinct rectangle made from 4 shale blocks … */
      for (const [yStr, corners] of Object.entries(cornersByY)) {
        const y = Number(yStr);
        if (corners.length < 4) continue;

        for (let a = 0; a < corners.length; ++a)
          for (let b = a + 1; b < corners.length; ++b)
            for (let c = b + 1; c < corners.length; ++c)
              for (let d = c + 1; d < corners.length; ++d) {
                const pts = [corners[a], corners[b], corners[c], corners[d]];

                // axis-aligned rectangle test
                const xs = pts.map((p) => p.x);
                const zs = pts.map((p) => p.z);
                const minX = Math.min(...xs),
                  maxX = Math.max(...xs);
                const minZ = Math.min(...zs),
                  maxZ = Math.max(...zs);

                const expected = new Set([
                  `${minX},${minZ}`,
                  `${minX},${maxZ}`,
                  `${maxX},${minZ}`,
                  `${maxX},${maxZ}`,
                ]);
                const actual = new Set(pts.map((p) => `${p.x},${p.z}`));
                if (
                  expected.size !== actual.size ||
                  ![...expected].every((k) => actual.has(k))
                )
                  continue; // not the four corners of an axis-aligned rectangle

                /* 4.  Check for dirt block exactly (or nearly) at the geometric centre. */
                const centreX = (minX + maxX) / 2;
                const centreZ = (minZ + maxZ) / 2;

                // integer block positions that could represent the centre (handles even widths)
                const candidates: { x: number; z: number }[] = [];
                const cx1 = Math.floor(centreX),
                  cx2 = Math.ceil(centreX);
                const cz1 = Math.floor(centreZ),
                  cz2 = Math.ceil(centreZ);
                for (const cx of [cx1, cx2])
                  for (const cz of [cz1, cz2])
                    candidates.push({ x: cx, z: cz });

                const hasDirtCentre = candidates.some(
                  ({ x, z }) =>
                    world.chunkLattice.getBlockId({ x, y, z }) === DIRT
                );

                if (!hasDirtCentre) continue; // centre isn’t dirt - not a garden
                /* 5.  Success!  Record the closest valid garden within 8 blocks. */
                const dx = centreX + 0.5 - playerPos.x;
                const dy = y + 0.5 - playerPos.y;
                const dz = centreZ + 0.5 - playerPos.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist > 15 || dist >= minGardenDistance) continue;

                minGardenDistance = dist;
                const gardenId = `${minX},${maxX},${minZ},${maxZ},${y}`;
                const ownerId = gardenOwnership.get(gardenId) || null;
                const gardenIdx = getOrAssignGardenIndex(gardenId);

                nearbyGarden = {
                  id: gardenId,
                  position: { x: centreX, y, z: centreZ },
                  isOwned: ownerId !== null,
                  ownerId,
                  gardenOwnerDisplay: null,
                  gardenIndex: gardenIdx,
                };

                console.log("Garden detected!", {
                  gardenId,
                  gardenIdx,
                  ownerId,
                  dist,
                });
              }
      }

      growingSeeds.forEach((seed, id) => {
        const dx = seed.plantPos.x - playerPos.x;
        const dy = seed.plantPos.y - playerPos.y;
        const dz = seed.plantPos.z - playerPos.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance <= 3) {
          const plantInfo = Object.values(PLANT_TYPES).find(
            (info): info is PlantType => info.name === seed.plantName
          );

          console.log("Server: Found plant info for seed:", {
            seedName: seed.plantName,
            plantInfo: plantInfo?.name,
          });

          if (plantInfo) {
            const elapsed = Date.now() - seed.startTime;
            const progress = Math.min(
              (elapsed / plantInfo.growthTime) * 100,
              100
            );
            const fullyGrown = progress >= 100;

            console.log("Server: Seed progress:", {
              seedName: seed.plantName,
              elapsed,
              progress,
              fullyGrown,
            });

            // Only update if this is the closest plant
            if (
              !nearbyPlant ||
              distance <
                Math.sqrt(
                  Math.pow(seed.plantPos.x - playerPos.x, 2) +
                    Math.pow(seed.plantPos.y - playerPos.y, 2) +
                    Math.pow(seed.plantPos.z - playerPos.z, 2)
                )
            ) {
              console.log(
                "OK. set the plant progress because its a nearby plant"
              );
              nearbyPlant = {
                name: plantInfo.name,
                position: { ...seed.plantPos },
              };
              plantProgress = progress;
              isPlantFullyGrown = fullyGrown;
            }
          }
        }
      });

      // Check for fully grown plants (entities that are not in growingSeeds)
      const allEntities = world.entityManager.getAllEntities();
      allEntities.forEach((entity) => {
        // Check if this entity is a plant (has plant model)
        const entityPos = entity.position;
        const dx = entityPos.x - playerPos.x;
        const dy = entityPos.y - playerPos.y;
        const dz = entityPos.z - playerPos.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance <= 3) {
          // Check if this entity is a fully grown plant by looking at its model
          const entityModel = entity.modelUri;

          // Check if this entity is a fully grown plant by looking for plant model names
          if (
            entityModel &&
            (entityModel.includes("carrot.gltf") ||
              entityModel.includes("melon.gltf") ||
              entityModel.includes("potato.gltf") ||
              entityModel.includes("cookie.gltf"))
          ) {
            // Find the plant info based on the model
            const plantInfo = Object.values(PLANT_TYPES).find(
              (info): info is PlantType => info.plantModel === entityModel
            );

            if (plantInfo) {
              // Only update if this is the closest plant and we don't already have a growing seed nearby
              if (
                !nearbyPlant ||
                distance < Math.sqrt(dx * dx + dy * dy + dz * dz)
              ) {
                nearbyPlant = {
                  name: plantInfo.name,
                  position: { ...entityPos },
                };
                plantProgress = 100; // Fully grown
                isPlantFullyGrown = true;
              }
            }
          }
        }
      });

      // Get currently held item
      const heldItem = playerHeldItemNames.get(player.id);

      // Send update to UI with debug logging
      let gardenOwnerDisplay = null;
      if (nearbyGarden && nearbyGarden.isOwned && nearbyGarden.ownerId) {
        if (nearbyGarden.ownerId === player.id) {
          gardenOwnerDisplay = "Your Garden";
        } else {
          // Try to get the owner's name using multiple methods
          let ownerName = "Player";

          // Method 1: Try using world.playerManager if available
          const wAny = world as any;
          if (typeof wAny.playerManager?.getPlayerById === "function") {
            const ownerPlayer = wAny.playerManager.getPlayerById(
              nearbyGarden.ownerId
            );
            if (ownerPlayer && ownerPlayer.name) {
              ownerName = ownerPlayer.name;
            }
          }
          // Method 2: Try using world.players array if available
          else if (Array.isArray(wAny.players)) {
            const ownerPlayer = wAny.players.find(
              (p: any) => p.id === nearbyGarden.ownerId
            );
            if (ownerPlayer && ownerPlayer.name) {
              ownerName = ownerPlayer.name;
            }
          }
          // Method 3: Try using entityManager to find player entities
          else {
            try {
              // Use the proper HYTOPIA SDK method to get player entities
              const playerEntities =
                world.entityManager.getPlayerEntitiesByPlayer({
                  id: nearbyGarden.ownerId,
                } as any);
              if (playerEntities.length > 0) {
                // Try to get the player name from the entity or use a fallback
                ownerName = "Player"; // Fallback name
              }
            } catch (e) {
              console.log(
                "Could not find player name for owner:",
                nearbyGarden.ownerId
              );
            }
          }

          gardenOwnerDisplay = `${ownerName}'s Garden`;
        }
      }
      const raycastData: RaycastData = {
        lookingAtDirt,
        heldItem: heldItem || null,
        closestDirtPos,
        nearbyPlant,
        plantProgress,
        isPlantFullyGrown,
        nearbyGarden: nearbyGarden
          ? { ...nearbyGarden, gardenOwnerDisplay }
          : null,
      };

      player.ui.sendData({
        type: "raycast_update",
        ...raycastData,
      });

      // Store the data for later use
      playerRaycastData.set(player.id, raycastData);
    }, 100);

    // Add input handling for planting
    const tickInterval = setInterval(() => {
      const raycastData = playerRaycastData.get(player.id);
      const heldItem = playerHeldItemNames.get(player.id);

      // Check if we can plant (looking at dirt and holding seed)
      const canPlant = raycastData?.lookingAtDirt && heldItem?.includes("Seed");

      // Check if we can claim garden (near unowned garden)
      const canClaimGarden =
        raycastData?.nearbyGarden && !raycastData.nearbyGarden.isOwned;

      // make this only print if ml is true
      if (player.input.ml) {
        console.log("Server: Can plant:", canPlant);
        console.log("Server: Can claim garden:", canClaimGarden);
        console.log("Server: Nearby garden:", raycastData?.nearbyGarden);
        console.log(
          "Server: Garden ownership map:",
          Array.from(gardenOwnership.entries())
        );
      }

      // If left mouse is pressed and we can claim garden
      if (player.input.ml && canClaimGarden) {
        console.log("Server: Claiming garden");

        const garden = raycastData.nearbyGarden;
        if (garden) {
          // Parse garden bounds from the ID
          const parts = garden.id.split(",");
          if (parts.length === 5) {
            const minX = parseInt(parts[0] || "0");
            const maxX = parseInt(parts[1] || "0");
            const minZ = parseInt(parts[2] || "0");
            const maxZ = parseInt(parts[3] || "0");
            const y = parseInt(parts[4] || "0");

            // Claim the garden
            gardenOwnership.set(garden.id, player.id);

            // Add garden to player's garden list
            const playerGardenList = playerGardens.get(player.id) || [];
            playerGardenList.push(garden.id);
            playerGardens.set(player.id, playerGardenList);

            // Create visual indicators for the garden
            createGardenBoundaryIndicators(
              world,
              garden.id,
              minX,
              maxX,
              minZ,
              maxZ,
              y,
              player.id
            );

            // Send garden claimed notification
            player.ui.sendData({
              type: "garden_claimed_notification",
            });

            // Notify player
            world.chatManager.sendPlayerMessage(
              player,
              "Garden Claimed! You can now plant seeds here.",
              "00FF00"
            );

            // Cancel the input so we don't claim multiple times
            player.input.ml = false;
          }
        }
      }
      // If left mouse is pressed and we can plant
      else if (player.input.ml && canPlant) {
        console.log("Server: Planting seed from input");

        // Get the closest dirt position from our stored raycast data
        if (raycastData?.closestDirtPos && heldItem) {
          // Check if this dirt is in an owned garden
          const dirtPos = raycastData.closestDirtPos;
          const gardenOwner = getGardenOwnerForPosition(
            dirtPos.x,
            dirtPos.y,
            dirtPos.z
          );

          if (!gardenOwner) {
            world.chatManager.sendPlayerMessage(
              player,
              "You need to claim this garden first before planting!",
              "FF0000"
            );
            player.input.ml = false;
            return;
          }

          if (gardenOwner !== player.id) {
            world.chatManager.sendPlayerMessage(
              player,
              "This garden belongs to another player!",
              "FF0000"
            );
            player.input.ml = false;
            return;
          }

          // Create a seed entity at the dirt position
          const plantPos = {
            x: dirtPos.x + 0.5, // Center on the block
            y: dirtPos.y + 0.1, // Slightly above the dirt
            z: dirtPos.z + 0.5, // Center on the block
          };

          const plantInfo = Object.values(PLANT_TYPES).find(
            (info): info is PlantType => info.name === heldItem
          );

          if (!plantInfo || !heldItem) {
            console.error("Unknown plant type or no item held:", heldItem);
            return;
          }

          // Create a new entity for the planted seed
          const plantedSeed = new Entity({
            modelUri: plantInfo.seedModel,
            modelScale: plantInfo.seedScale,
            rigidBodyOptions: {
              enabled: true,
              type: RigidBodyType.FIXED,
            },
          });

          // Spawn the planted seed
          plantedSeed.spawn(world, plantPos);

          // Add to growing seeds map with plant info
          const seedId = `${plantPos.x},${plantPos.y},${plantPos.z}`;
          growingSeeds.set(seedId, {
            entity: plantedSeed,
            startTime: Date.now(),
            startScale: plantInfo.seedScale,
            endScale: plantInfo.plantScale,
            startY: plantPos.y,
            endY: plantPos.y + plantInfo.finalHeight,
            plantPos: plantPos,
            plantName: plantInfo.name,
          });

          // Get inventory and remove the seed
          const inventory = playerInventories.get(player.id) || [];
          const heldItemIndex = inventory.findIndex(
            (item) => item === heldItem
          );
          if (heldItemIndex !== -1) {
            inventory.splice(heldItemIndex, 1);
            playerInventories.set(player.id, inventory);
          }

          // Despawn the held seed if it exists
          const heldItemEntity = playerHeldItems.get(player.id);
          if (heldItemEntity) {
            heldItemEntity.despawn();
          }

          // Clear held item references
          playerHeldItems.set(player.id, null);
          playerHeldItemNames.set(player.id, null);

          // Update inventory UI
          updatePlayerInventoryUI(player, world, null);

          // Notify player
          world.chatManager.sendPlayerMessage(
            player,
            `Planted ${heldItem}! 🌱`,
            "00FF00"
          );

          // Cancel the input so we don't plant multiple times
          player.input.ml = false;
        }
      }
    }, 1);

    // Add growth animation tick
    const growthInterval = setInterval(() => {
      const now = Date.now();
      growingSeeds.forEach((seed, id) => {
        const elapsed = now - seed.startTime;
        const plantInfo = Object.values(PLANT_TYPES).find(
          (info): info is PlantType => info.name === seed.plantName
        );

        if (!plantInfo) {
          console.error("Unknown plant type:", seed.plantName);
          growingSeeds.delete(id);
          return;
        }

        const t = Math.min(elapsed / plantInfo.growthTime, 1);

        if (t >= 1) {
          // Growth complete, replace with plant
          seed.entity.despawn();
          growingSeeds.delete(id);

          // Create plant entity with proper model and properties
          const plant = new Entity({
            modelUri: plantInfo.plantModel,
            modelScale: plantInfo.plantScale,
            modelLoopedAnimations: ["idle"],
            rigidBodyOptions: {
              enabled: true,
              type: RigidBodyType.FIXED,
            },
          });

          // Spawn plant at final position with slight random rotation
          const finalRotation = {
            x: 0,
            y: Math.random() * Math.PI * 2,
            z: 0,
            w: 1,
          };

          plant.spawn(world, {
            ...seed.plantPos,
            y: seed.endY,
          });
          plant.setRotation(finalRotation);

          // Add a small bounce animation when fully grown
          const originalY = seed.endY;
          plant.setPosition({ ...seed.plantPos, y: originalY + 0.2 });
          setTimeout(() => {
            plant.setPosition({ ...seed.plantPos, y: originalY });
          }, 200);

          // Notify nearby players with a more exciting message
          world.chatManager.sendPlayerMessage(
            player,
            `✨ A fresh ${plantInfo.name.replace(" Seed", "")} has grown! ${
              plantInfo.emoji
            }`,
            plantInfo.color
          );
        } else {
          // Update scale and position using lerp
          const currentScale = lerp(
            plantInfo.seedScale,
            plantInfo.plantScale,
            t
          );
          const currentY = lerp(seed.startY, seed.endY, t);

          // Create new entity with updated scale
          const newEntity = new Entity({
            modelUri: plantInfo.seedModel,
            modelScale: currentScale,
            rigidBodyOptions: {
              enabled: true,
              type: RigidBodyType.FIXED,
            },
          });

          // Replace old entity
          seed.entity.despawn();
          newEntity.spawn(world, {
            ...seed.plantPos,
            y: currentY,
          });
          seed.entity = newEntity;
        }
      });
    }, 16);

    // Handle planting seeds
    player.ui.on(PlayerUIEvent.DATA, ({ playerUI, data }) => {
      if (data.type === "hold") {
        handleItemHold(player, world, playerEntity, data.index);
      } else if (data.type === "claim_garden") {
        console.log("Server: Claiming garden from UI");
        const raycastData = playerRaycastData.get(player.id);

        if (raycastData?.nearbyGarden && !raycastData.nearbyGarden.isOwned) {
          const garden = raycastData.nearbyGarden;

          // Parse garden bounds from the ID
          const parts = garden.id.split(",");
          if (parts.length === 5) {
            const minX = parseInt(parts[0] || "0");
            const maxX = parseInt(parts[1] || "0");
            const minZ = parseInt(parts[2] || "0");
            const maxZ = parseInt(parts[3] || "0");
            const y = parseInt(parts[4] || "0");

            // Claim the garden
            gardenOwnership.set(garden.id, player.id);

            // Add garden to player's garden list
            const playerGardenList = playerGardens.get(player.id) || [];
            playerGardenList.push(garden.id);
            playerGardens.set(player.id, playerGardenList);

            // Create visual indicators for the garden
            createGardenBoundaryIndicators(
              world,
              garden.id,
              minX,
              maxX,
              minZ,
              maxZ,
              y,
              player.id
            );

            // Send garden claimed notification
            player.ui.sendData({
              type: "garden_claimed_notification",
            });

            // Notify player
            world.chatManager.sendPlayerMessage(
              player,
              "Garden Claimed! You can now plant seeds here.",
              "00FF00"
            );
          }
        } else {
          world.chatManager.sendPlayerMessage(
            player,
            "No unowned garden nearby to claim!",
            "FF0000"
          );
        }
      } else if (data.type === "plant_seed") {
        console.log("Server: Planting seed");
        const inventory = playerInventories.get(player.id) || [];
        const heldItem = playerHeldItems.get(player.id);
        const heldItemName = playerHeldItemNames.get(player.id);
        const heldItemIndex = heldItemName
          ? inventory.findIndex((item) => item === heldItemName)
          : -1;

        // Get the closest dirt position from our stored raycast data
        const raycastData = playerRaycastData.get(player.id);

        if (
          heldItemIndex !== -1 &&
          heldItemName?.includes("Seed") &&
          raycastData?.closestDirtPos
        ) {
          // Check if this dirt is in an owned garden
          const dirtPos = raycastData.closestDirtPos;
          const gardenOwner = getGardenOwnerForPosition(
            dirtPos.x,
            dirtPos.y,
            dirtPos.z
          );

          if (!gardenOwner) {
            world.chatManager.sendPlayerMessage(
              player,
              "You need to claim this garden first before planting!",
              "FF0000"
            );
            return;
          }

          if (gardenOwner !== player.id) {
            world.chatManager.sendPlayerMessage(
              player,
              "This garden belongs to another player!",
              "FF0000"
            );
            return;
          }

          // Create a seed entity at the dirt position
          const plantPos = {
            x: dirtPos.x + 0.5, // Center on the block
            y: dirtPos.y + 0.1, // Slightly above the dirt
            z: dirtPos.z + 0.5, // Center on the block
          };

          const plantInfo = Object.values(PLANT_TYPES).find(
            (info): info is PlantType => info.name === heldItemName
          );

          if (!plantInfo || !heldItemName) {
            console.error("Unknown plant type or no item held:", heldItemName);
            return;
          }

          // Create a new entity for the planted seed
          const plantedSeed = new Entity({
            modelUri: plantInfo.seedModel,
            modelScale: plantInfo.seedScale,
            rigidBodyOptions: {
              enabled: true,
              type: RigidBodyType.FIXED,
            },
          });

          // Spawn the planted seed
          plantedSeed.spawn(world, plantPos);

          // Remove the seed from inventory
          inventory.splice(heldItemIndex, 1);
          playerInventories.set(player.id, inventory);

          // Despawn the held seed if it exists
          const heldItemEntity = playerHeldItems.get(player.id);
          if (heldItemEntity) {
            heldItemEntity.despawn();
          }

          // Clear held item references
          playerHeldItems.set(player.id, null);
          playerHeldItemNames.set(player.id, null);

          // Update inventory UI
          updatePlayerInventoryUI(player, world, null);

          // Notify player
          world.chatManager.sendPlayerMessage(
            player,
            `Planted ${heldItemName}! 🌱`,
            "00FF00"
          );

          // Add a small animation to make it look like it's being planted
          const originalY = plantPos.y;
          plantedSeed.setPosition({ ...plantPos, y: originalY + 0.2 }); // Start slightly higher
          setTimeout(() => {
            plantedSeed.setPosition({ ...plantPos, y: originalY }); // Settle into place
          }, 200);
        } else if (!raycastData?.closestDirtPos) {
          world.chatManager.sendPlayerMessage(
            player,
            "You need to be near dirt to plant seeds!",
            "FF0000"
          );
        } else if (!heldItemName?.includes("Seed")) {
          world.chatManager.sendPlayerMessage(
            player,
            "You need to hold a seed to plant it!",
            "FF0000"
          );
        }
      } else if (data.type === "harvest_plant") {
        console.log("Server: Harvest plant request received"); // Debug log

        const raycastData = playerRaycastData.get(player.id);
        if (!raycastData?.nearbyPlant) {
          console.log("Server: No nearby plant found"); // Debug log
          return;
        }

        console.log("Server: Nearby plant found:", raycastData.nearbyPlant); // Debug log

        // First, try to find a growing seed by position
        const seedId = Array.from(growingSeeds.entries()).find(([_, seed]) => {
          const dx = seed.plantPos.x - raycastData.nearbyPlant!.position.x;
          const dy = seed.plantPos.y - raycastData.nearbyPlant!.position.y;
          const dz = seed.plantPos.z - raycastData.nearbyPlant!.position.z;
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          return distance < 0.1; // Use a small threshold for position matching
        })?.[0];

        console.log("Server: Found seed ID:", seedId); // Debug log

        if (seedId) {
          // Handle growing seed harvest
          const seed = growingSeeds.get(seedId);
          if (!seed) {
            console.log("Server: Seed not found in growing seeds map"); // Debug log
            return;
          }

          const plantInfo = Object.values(PLANT_TYPES).find(
            (info): info is PlantType => info.name === seed.plantName
          );

          if (!plantInfo) {
            console.log("Server: Plant info not found for:", seed.plantName); // Debug log
            return;
          }

          // Only allow harvesting if fully grown
          const elapsed = Date.now() - seed.startTime;
          if (elapsed < plantInfo.growthTime) {
            console.log("Server: Plant not fully grown yet"); // Debug log
            world.chatManager.sendPlayerMessage(
              player,
              "This plant is not ready to harvest yet!",
              "FF0000"
            );
            return;
          }

          console.log("Server: Harvesting growing seed:", plantInfo.name); // Debug log

          // Remove the growing seed
          seed.entity.despawn();
          growingSeeds.delete(seedId);

          // Add harvested item to inventory
          const inventory = playerInventories.get(player.id) || [];
          const harvestedItem = plantInfo.name.replace(" Seed", "");
          inventory.push(harvestedItem);
          playerInventories.set(player.id, inventory);

          // Update inventory UI
          updatePlayerInventoryUI(player, world);

          // Notify player with a more exciting message
          world.chatManager.sendPlayerMessage(
            player,
            `✨ Harvested a ${harvestedItem}! ${plantInfo.emoji}`,
            plantInfo.color
          );

          // Add a small animation effect
          const harvestEffect = new Entity({
            modelUri: plantInfo.plantModel,
            modelScale: plantInfo.plantScale * 0.5,
            rigidBodyOptions: {
              enabled: false,
            },
          });

          harvestEffect.spawn(world, {
            ...seed.plantPos,
            y: seed.plantPos.y + 0.5,
          });

          // Make the harvested item float up and fade out
          setTimeout(() => {
            harvestEffect.despawn();
          }, 1000);
        } else {
          // Handle fully grown plant entity harvest
          console.log(
            "Server: No growing seed found, checking for fully grown plant entity"
          ); // Debug log

          // Find the plant entity at the nearby plant position
          const allEntities = world.entityManager.getAllEntities();
          const plantEntity = allEntities.find((entity) => {
            const entityPos = entity.position;
            const dx = entityPos.x - raycastData.nearbyPlant!.position.x;
            const dy = entityPos.y - raycastData.nearbyPlant!.position.y;
            const dz = entityPos.z - raycastData.nearbyPlant!.position.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            return distance < 0.1; // Use a small threshold for position matching
          });

          if (plantEntity) {
            console.log("Server: Found plant entity to harvest"); // Debug log

            // Find the plant info based on the entity's model
            const entityModel = plantEntity.modelUri;
            const plantInfo = Object.values(PLANT_TYPES).find(
              (info): info is PlantType => info.plantModel === entityModel
            );

            if (plantInfo) {
              console.log(
                "Server: Harvesting fully grown plant:",
                plantInfo.name
              ); // Debug log

              // Remove the plant entity
              plantEntity.despawn();

              // Add harvested item to inventory
              const inventory = playerInventories.get(player.id) || [];
              const harvestedItem = plantInfo.name.replace(" Seed", "");
              inventory.push(harvestedItem);
              playerInventories.set(player.id, inventory);

              // Update inventory UI
              updatePlayerInventoryUI(player, world);

              // Notify player with a more exciting message
              world.chatManager.sendPlayerMessage(
                player,
                `✨ Harvested a ${harvestedItem}! ${plantInfo.emoji}`,
                plantInfo.color
              );

              // Add a small animation effect
              const harvestEffect = new Entity({
                modelUri: plantInfo.plantModel,
                modelScale: plantInfo.plantScale * 0.5,
                rigidBodyOptions: {
                  enabled: false,
                },
              });

              harvestEffect.spawn(world, {
                ...raycastData.nearbyPlant.position,
                y: raycastData.nearbyPlant.position.y + 0.5,
              });

              // Make the harvested item float up and fade out
              setTimeout(() => {
                harvestEffect.despawn();
              }, 1000);
            } else {
              console.log(
                "Server: Plant info not found for entity model:",
                entityModel
              ); // Debug log
              world.chatManager.sendPlayerMessage(
                player,
                "Unknown plant type!",
                "FF0000"
              );
            }
          } else {
            console.log("Server: No plant entity found at position"); // Debug log
            world.chatManager.sendPlayerMessage(
              player,
              "No plant found to harvest!",
              "FF0000"
            );
          }
        }
      }
    });

    // Handle inventory updates through chat commands
    world.chatManager.registerCommand("/hold", (player, args) => {
      if (!args[0]) {
        world.chatManager.sendPlayerMessage(
          player,
          "Please specify an item index (0-8)"
        );
        return;
      }

      const index = parseInt(args[0]);
      if (isNaN(index) || index < 0 || index > 8) {
        world.chatManager.sendPlayerMessage(
          player,
          "Please enter a valid index (0-8)"
        );
        return;
      }

      handleItemHold(player, world, playerEntity, index);
    });

    // Update the held item visualization
    function handleItemHold(
      player: any,
      world: any,
      playerEntity: any,
      index: number
    ) {
      const inventory = playerInventories.get(player.id) || [];
      const selectedItem = inventory[index];
      const currentHeldItem = playerHeldItems.get(player.id);

      // If we're already holding this item, stop holding it
      if (
        currentHeldItem &&
        selectedItem &&
        inventory.indexOf(selectedItem) === index
      ) {
        currentHeldItem.despawn();
        playerHeldItemNames.set(player.id, null);
        return;
      }

      if (selectedItem) {
        // Remove any currently held item
        if (currentHeldItem) {
          currentHeldItem.despawn();
          playerHeldItemNames.set(player.id, null);
        }

        // Find plant info for the selected item
        const plantInfo = Object.values(PLANT_TYPES).find(
          (info): info is PlantType => info.name === selectedItem
        );

        if (plantInfo) {
          // Create new item with the plant's model
          const itemEntity = new Entity({
            modelUri: plantInfo.plantModel,
            modelScale: plantInfo.plantScale * 0.75,
            // Note: Opacity will be handled in the UI layer
            rigidBodyOptions: {
              enabled: false,
            },
          });

          // Get player's position and rotation
          const playerPos = playerEntity.position;
          const playerRot = playerEntity.rotation;

          // Calculate hand position
          const handOffset = {
            x: 0,
            y: -0.5,
            z: -0.5,
          };

          const spawnPos = {
            x: playerPos.x + handOffset.x,
            y: playerPos.y + handOffset.y,
            z: playerPos.z + handOffset.z,
          };

          itemEntity.spawn(world, spawnPos);

          // Store the item entity and update held item name
          playerHeldItems.set(player.id, itemEntity);
          playerHeldItemNames.set(player.id, selectedItem);

          // Set as child of player immediately
          itemEntity.setParent(playerEntity);

          // Set position relative to parent
          itemEntity.setPosition(handOffset);

          // Update inventory UI to show held item
          updatePlayerInventoryUI(player, world, index);

          // Notify player
          world.chatManager.sendPlayerMessage(
            player,
            `Holding ${selectedItem}`
          );

          // Add event listener for when item is despawned
          itemEntity.on(EntityEvent.DESPAWN, () => {
            const currentHeld = playerHeldItems.get(player.id);
            if (currentHeld === itemEntity) {
              updatePlayerInventoryUI(player, world, null);
              world.chatManager.sendPlayerMessage(
                player,
                `Stopped holding ${selectedItem}`
              );
              playerHeldItems.set(player.id, null);
              playerHeldItemNames.set(player.id, null);
            }
          });
        }
      } else {
        world.chatManager.sendPlayerMessage(player, "No item in that slot!");
      }
    }

    // Clean up when player leaves
    player.on(PlayerEvent.LEFT_WORLD, () => {
      clearInterval(tickInterval);
      clearInterval(growthInterval);
      clearInterval(dirtCheckInterval);
      playerRaycastData.delete(player.id);
      playerHeldItemNames.delete(player.id);
      playerCash.delete(player.id);
    });
  });

  // Update buy command to handle cash system
  world.chatManager.registerCommand("/buy", (player, args) => {
    if (!args[0]) {
      const plantList = Object.entries(PLANT_TYPES)
        .map(([type, info]) => {
          const growthTimeInSeconds = info.growthTime / 1000;
          return `${type.replace("-seed", "")} (${
            info.cost
          } cash, ${growthTimeInSeconds}s)`;
        })
        .join(", ");

      world.chatManager.sendPlayerMessage(
        player,
        "Please specify what you want to buy. Available seeds: " + plantList
      );
      return;
    }

    const item = args[0].toLowerCase();
    const seedType = item.endsWith("-seed") ? item : `${item}-seed`;

    if (seedType in PLANT_TYPES) {
      const plantInfo = PLANT_TYPES[seedType];
      if (!plantInfo) return; // Type guard for TypeScript

      // Get player's current cash
      const currentCash = playerCash.get(player.id) || 0;

      // Check if player has enough cash
      if (currentCash < plantInfo.cost) {
        world.chatManager.sendPlayerMessage(
          player,
          `Not enough cash! You need ${plantInfo.cost} cash but only have ${currentCash} cash.`,
          "FF0000"
        );
        return;
      }

      // Deduct cash from player
      const newCash = currentCash - plantInfo.cost;
      playerCash.set(player.id, newCash);

      // Get player's inventory
      const inventory = playerInventories.get(player.id) || [];

      // Add seed to inventory
      inventory.push(plantInfo.name);
      playerInventories.set(player.id, inventory);

      // Update the inventory UI
      updatePlayerInventoryUI(player, world);

      // Update cash UI
      player.ui.sendData({
        type: "cash_update",
        cash: newCash,
      });

      // Spawn a visual seed entity that follows the player briefly
      const seed = new Entity({
        modelUri: plantInfo.seedModel,
        modelScale: plantInfo.seedScale,
        rigidBodyOptions: {
          enabled: false,
        },
      });

      const playerEntity =
        world.entityManager.getPlayerEntitiesByPlayer(player)[0];
      if (playerEntity) {
        const pos = playerEntity.position;
        seed.spawn(world, { x: pos.x, y: pos.y + 2, z: pos.z });

        // Make the seed float up and disappear after 2 seconds
        setTimeout(() => {
          seed.despawn();
        }, 2000);
      }

      const growthTimeInSeconds = plantInfo.growthTime / 1000;
      world.chatManager.sendPlayerMessage(
        player,
        `You bought a ${plantInfo.name} for ${plantInfo.cost} cash! 🌱 (Growth time: ${growthTimeInSeconds} seconds)`,
        "00FF00"
      );
      world.chatManager.sendPlayerMessage(player, `Remaining cash: ${newCash}`);
      world.chatManager.sendPlayerMessage(
        player,
        "Use /hold <slot> to hold an item (e.g. /hold 0)"
      );
    } else {
      const plantList = Object.entries(PLANT_TYPES)
        .map(([type, info]) => {
          const growthTimeInSeconds = info.growthTime / 1000;
          return `${type.replace("-seed", "")} (${
            info.cost
          } cash, ${growthTimeInSeconds}s)`;
        })
        .join(", ");

      world.chatManager.sendPlayerMessage(
        player,
        "Sorry, that seed is not available for purchase. Available seeds: " +
          plantList
      );
    }
  });

  // Add command to check inventory
  world.chatManager.registerCommand("/inventory", (player) => {
    const inventory = playerInventories.get(player.id) || [];
    if (inventory.length === 0) {
      world.chatManager.sendPlayerMessage(player, "Your inventory is empty.");
    } else {
      const itemCounts = inventory.reduce((acc, item) => {
        acc[item] = (acc[item] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const inventoryList = Object.entries(itemCounts)
        .map(([item, count]) => `${item}: ${count}`)
        .join(", ");

      world.chatManager.sendPlayerMessage(
        player,
        `Inventory: ${inventoryList}`
      );
    }
  });

  // Add command to check cash
  world.chatManager.registerCommand("/cash", (player) => {
    const cash = playerCash.get(player.id) || 0;
    world.chatManager.sendPlayerMessage(
      player,
      `You have ${cash} cash.`,
      "FFD700"
    );
  });

  // Add sell command to sell harvested plants
  world.chatManager.registerCommand("/sell", (player) => {
    const inventory = playerInventories.get(player.id) || [];
    const currentCash = playerCash.get(player.id) || 0;

    // Filter out seeds (only sell harvested plants)
    const harvestedPlants = inventory.filter((item) => !item.includes("Seed"));

    if (harvestedPlants.length === 0) {
      world.chatManager.sendPlayerMessage(
        player,
        "You don't have any harvested plants to sell!",
        "FF0000"
      );
      return;
    }

    let totalEarnings = 0;
    const soldItems: { name: string; count: number; price: number }[] = [];

    // Count and calculate earnings for each plant type
    const plantCounts = harvestedPlants.reduce((acc, item) => {
      acc[item] = (acc[item] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Find selling prices for each plant
    Object.entries(plantCounts).forEach(([plantName, count]) => {
      const plantInfo = Object.values(PLANT_TYPES).find(
        (info): info is PlantType =>
          info.name.replace(" Seed", "") === plantName
      );

      if (plantInfo) {
        const earnings = plantInfo.sellPrice * count;
        totalEarnings += earnings;
        soldItems.push({
          name: plantName,
          count: count,
          price: plantInfo.sellPrice,
        });
      }
    });

    // Update player's cash
    const newCash = currentCash + totalEarnings;
    playerCash.set(player.id, newCash);

    // Remove sold plants from inventory
    const newInventory = inventory.filter((item) => item.includes("Seed"));
    playerInventories.set(player.id, newInventory);

    // Update UI
    updatePlayerInventoryUI(player, world);
    player.ui.sendData({
      type: "cash_update",
      cash: newCash,
    });

    // Send sell notification to UI
    player.ui.sendData({
      type: "sell_notification",
      plantsSold: harvestedPlants.length,
      totalEarnings: totalEarnings,
    });

    // Send success message with details
    world.chatManager.sendPlayerMessage(
      player,
      `💰 Sold ${harvestedPlants.length} plants for ${totalEarnings} cash!`,
      "00FF00"
    );

    // Show breakdown of what was sold
    soldItems.forEach((item) => {
      world.chatManager.sendPlayerMessage(
        player,
        `  ${item.count}x ${item.name} - ${item.price} cash each`,
        "00FF00"
      );
    });

    world.chatManager.sendPlayerMessage(
      player,
      `New balance: ${newCash} cash`,
      "FFD700"
    );
  });

  /**
   * Handle player leaving the game. The PlayerEvent.LEFT_WORLD
   * event is emitted to the world when a player leaves the game.
   * Because HYTOPIA is not opinionated on join and
   * leave game logic, we are responsible for cleaning
   * up the player and any entities associated with them
   * after they leave. We can easily do this by
   * getting all the known PlayerEntity instances for
   * the player who left by using our world's EntityManager
   * instance.
   *
   * The HYTOPIA SDK is heavily driven by events, you
   * can find documentation on how the event system works,
   * here: https://dev.hytopia.com/sdk-guides/events
   */
  world.on(PlayerEvent.LEFT_WORLD, ({ player }) => {
    // Clean up held item
    const heldItem = playerHeldItems.get(player.id);
    if (heldItem) {
      heldItem.despawn();
    }
    playerHeldItems.delete(player.id);

    // Clean up inventory
    playerInventories.delete(player.id);

    // Clean up cash
    playerCash.delete(player.id);

    // Clean up player entity
    world.entityManager
      .getPlayerEntitiesByPlayer(player)
      .forEach((entity) => entity.despawn());
  });

  /**
   * A silly little easter egg command. When a player types
   * "/rocket" in the game, they'll get launched into the air!
   */
  world.chatManager.registerCommand("/rocket", (player) => {
    world.entityManager.getPlayerEntitiesByPlayer(player).forEach((entity) => {
      entity.applyImpulse({ x: 0, y: 0, z: -20 });
    });
  });

  // Add command to toggle garden boundary indicators
  world.chatManager.registerCommand("/garden-indicators", (player) => {
    const args = (player.input as any).text?.split(" ") || [];
    const action = args[1]?.toLowerCase();

    if (action === "show" || action === "on") {
      updateGardenBoundaryIndicators(world);
      world.chatManager.sendPlayerMessage(
        player,
        "Garden boundary indicators enabled!",
        "00FF00"
      );
    } else if (action === "hide" || action === "off") {
      // Remove all garden boundary indicators
      gardenBoundaryIndicators.forEach((indicators, gardenId) => {
        indicators.forEach((indicator) => indicator.despawn());
      });
      gardenBoundaryIndicators.clear();
      world.chatManager.sendPlayerMessage(
        player,
        "Garden boundary indicators disabled!",
        "FF0000"
      );
    } else {
      world.chatManager.sendPlayerMessage(
        player,
        "Usage: /garden-indicators [show|hide|on|off]",
        "FFFF00"
      );
    }
  });

  // Add command to reset garden indices (for testing)
  world.chatManager.registerCommand("/reset-garden-indices", (player) => {
    resetGardenIndices();
    world.chatManager.sendPlayerMessage(
      player,
      "Garden indices reset! Next garden will be #1",
      "FFFF00"
    );
  });

  /**
   * Play some peaceful ambient music to
   * set the mood!
   */

  new Audio({
    uri: "audio/music/hytopia-main.mp3",
    loop: true,
    volume: 0.1,
  }).play(world);
});
