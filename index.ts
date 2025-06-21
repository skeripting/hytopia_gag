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
  PersistenceManager,
  PlayerCameraMode,
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
const gardenOwnership = new Map<string, string>(); // diamondPosition -> playerId
const playerGardens = new Map<string, string[]>(); // playerId -> diamondPositions[]

// Add garden indexing system
const gardenIndices = new Map<string, number>(); // diamondPosition -> gardenIndex
let nextGardenIndex = 1; // Next available garden index

// Add tracking for fully grown plants to prevent duplicate harvesting
const fullyGrownPlants = new Map<string, Entity>(); // plantPosition -> plantEntity

// Add username tracking for garden ownership display
const playerUsernames = new Map<string, string>(); // playerId -> username

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
  canHarvestPlant: boolean;
  nearbyDiamond: {
    position: { x: number; y: number; z: number };
    isOwned: boolean;
    ownerId: string | null;
    gardenOwnerDisplay: string | null;
    gardenIndex: number | null;
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

// Add type definitions for persisted data
type PlayerData = {
  inventory: string[];
  cash: number;
  username: string;
  lastSavedAt: number;
};

type GrowingPlantData = {
  plantName: string;
  startTime: number;
  startScale: number;
  endScale: number;
  startY: number;
  endY: number;
  plantPos: { x: number; y: number; z: number };
};

type GardenData = {
  diamondPosition: string;
  ownerId: string;
  gardenIndex: number;
  growingPlants: GrowingPlantData[];
};

// Global data types
type GlobalGameData = {
  gardenOwnership: { [key: string]: string };
  gardenIndices: { [key: string]: number };
  nextGardenIndex: number;
  lastSavedAt: number;
};

const PLANT_TYPES: PlantTypes = {
  "carrot-seed": {
    name: "Carrot Seed",
    seedModel: "models/items/stick.gltf",
    plantModel: "models/items/carrot.gltf",
    seedScale: 0.3,
    plantScale: 1.2,
    growthTime: 8000, // 8 seconds
    finalHeight: 1.2, // Increased from 0.5 to 1.2 for better visibility
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
    growthTime: 60000, // 1 minute
    finalHeight: 0.8, // Increased from 0.3 to 0.8 for better visibility
    color: "00FF00", // Green
    emoji: "🍈",
    cost: 25, // 25 cash
    sellPrice: 60, // 60 cash
  },
  "potato-seed": {
    name: "Potato Seed",
    seedModel: "models/items/stick.gltf",
    plantModel: "models/items/potato.gltf", // Using bone as placeholder
    seedScale: 0.3,
    plantScale: 0.8,
    growthTime: 360000, // 6 mins
    finalHeight: 1.0, // Increased from 0.6 to 1.0 for better visibility
    color: "8B4513", // Brown
    emoji: "🥔",
    cost: 75, // 75 cash
    sellPrice: 250, // 250 cash
  },
  "mushroom-seed": {
    name: "Mushroom Seed",
    seedModel: "models/items/stick.gltf",
    plantModel: "models/items/stew-mushroom.gltf", // Using map as placeholder
    seedScale: 0.3,
    plantScale: 2.0,
    growthTime: 1000 * 10, // 10 minutes
    finalHeight: 1.5,
    color: "8B4513", // Gold
    emoji: "🍄",
    cost: 1000, // 1000 cash
    sellPrice: 1750, // 1750 cash
  },
  "cookie-seed": {
    name: "Cookie Seed",
    seedModel: "models/items/stick.gltf",
    plantModel: "models/items/cookie.gltf", // Using map as placeholder
    seedScale: 0.3,
    plantScale: 2.0,
    growthTime: 1000 * 25, // 25 minutes
    finalHeight: 1.5,
    color: "8B4513", // Gold
    emoji: "🍪",
    cost: 1000, // 1000 cash
    sellPrice: 1750, // 1750 cash
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

// Function to save player data
const savePlayerData = async (player: any) => {
  try {
    const playerData: PlayerData = {
      inventory: playerInventories.get(player.id) || [],
      cash: playerCash.get(player.id) || 0,
      username: playerUsernames.get(player.id) || "Player",
      lastSavedAt: Date.now(),
    };

    await PersistenceManager.instance.setPlayerData(player, playerData);
    console.log(`Saved data for player ${player.id}`);
  } catch (error) {
    console.error(`Failed to save player data for ${player.id}:`, error);
  }
};

// Function to load player data
const loadPlayerData = async (player: any): Promise<PlayerData | null> => {
  try {
    const playerData = await PersistenceManager.instance.getPlayerData(player);
    if (playerData) {
      console.log(`Loaded data for player ${player.id}`);
      return playerData as PlayerData;
    }
    // No existing data found - this is normal for new players
    console.log(`No existing data for player ${player.id} - starting fresh`);
    return null;
  } catch (error: any) {
    // This is expected for new players when no data exists yet
    // Check if it's a file not found error (which is expected)
    if (error.code === "ENOENT" || error.message?.includes("no such file")) {
      console.log(`No existing data for player ${player.id} - starting fresh`);
      return null;
    }
    // For other unexpected errors, log them
    console.error(
      `Unexpected error loading player data for ${player.id}:`,
      error
    );
    return null;
  }
};

// Function to save global game data
const saveGlobalGameData = async () => {
  try {
    const globalData: GlobalGameData = {
      gardenOwnership: Object.fromEntries(gardenOwnership),
      gardenIndices: Object.fromEntries(gardenIndices),
      nextGardenIndex,
      lastSavedAt: Date.now(),
    };

    await PersistenceManager.instance.setGlobalData(
      "global_game_data",
      globalData
    );
    console.log("Saved global game data");
  } catch (error) {
    console.error("Failed to save global game data:", error);
  }
};

// Function to load global game data
const loadGlobalGameData = async () => {
  try {
    const globalData = await PersistenceManager.instance.getGlobalData(
      "global_game_data"
    );
    if (globalData) {
      const data = globalData as GlobalGameData;

      // Restore garden ownership
      gardenOwnership.clear();
      Object.entries(data.gardenOwnership).forEach(([key, value]) => {
        gardenOwnership.set(key, value);
      });

      // Restore garden indices
      gardenIndices.clear();
      Object.entries(data.gardenIndices).forEach(([key, value]) => {
        gardenIndices.set(key, value);
      });

      // Restore next garden index
      nextGardenIndex = data.nextGardenIndex;

      // Rebuild player gardens map
      playerGardens.clear();
      gardenOwnership.forEach((ownerId, diamondKey) => {
        const playerGardenList = playerGardens.get(ownerId) || [];
        playerGardenList.push(diamondKey);
        playerGardens.set(ownerId, playerGardenList);
      });

      console.log("Loaded global game data");
      return true;
    }
    // No existing data found - this is normal for first time startup
    console.log("No existing global game data found - starting fresh");
    return false;
  } catch (error: any) {
    // This is expected on first startup when no data exists yet
    // Check if it's a file not found error (which is expected)
    if (error.code === "ENOENT" || error.message?.includes("no such file")) {
      console.log("No existing global game data - starting fresh");
      return false;
    }
    // For other unexpected errors, log them
    console.error("Unexpected error loading global game data:", error);
    return false;
  }
};

// Function to save growing plants data for a player
const saveGrowingPlantsData = async (player: any) => {
  try {
    const playerGardenList = playerGardens.get(player.id) || [];
    const growingPlantsData: GrowingPlantData[] = [];

    growingSeeds.forEach((seed, seedId) => {
      // Check if this seed is in the player's garden
      const seedPos = seed.plantPos;
      const isInPlayerGarden = playerGardenList.some((diamondKey) => {
        const parts = diamondKey.split(",");
        if (parts.length === 3) {
          const diamondX = parseInt(parts[0] || "0");
          const diamondY = parseInt(parts[1] || "0");
          const diamondZ = parseInt(parts[2] || "0");

          const distance = Math.sqrt(
            Math.pow(seedPos.x - diamondX, 2) +
              Math.pow(seedPos.y - diamondY, 2) +
              Math.pow(seedPos.z - diamondZ, 2)
          );

          return distance <= 15; // Within garden radius
        }
        return false;
      });

      if (isInPlayerGarden) {
        growingPlantsData.push({
          plantName: seed.plantName,
          startTime: seed.startTime,
          startScale: seed.startScale,
          endScale: seed.endScale,
          startY: seed.startY,
          endY: seed.endY,
          plantPos: seed.plantPos,
        });
      }
    });

    await PersistenceManager.instance.setPlayerData(player, {
      growingPlants: growingPlantsData,
    });
    console.log(`Saved growing plants data for player ${player.id}`);
  } catch (error) {
    console.error(
      `Failed to save growing plants data for ${player.id}:`,
      error
    );
  }
};

// Function to load and restore growing plants for a player
const loadGrowingPlantsData = async (player: any, world: any) => {
  try {
    const playerData = await PersistenceManager.instance.getPlayerData(player);
    if (playerData && (playerData as any).growingPlants) {
      const plants = (playerData as any).growingPlants as GrowingPlantData[];
      const lastSavedAt = (playerData as any).lastSavedAt || Date.now();
      const now = Date.now();
      const offlineTime = now - lastSavedAt;

      plants.forEach((plantData) => {
        const plantInfo = Object.values(PLANT_TYPES).find(
          (info): info is PlantType => info.name === plantData.plantName
        );

        if (plantInfo) {
          // Calculate how much the plant should have grown while offline
          const originalElapsed = now - plantData.startTime;
          const offlineGrowthTime = Math.min(offlineTime, plantInfo.growthTime);

          // Adjust start time to account for offline growth
          // This makes the plant appear as if it grew while the player was away
          const adjustedStartTime = plantData.startTime - offlineGrowthTime;

          // Create the growing seed entity
          const plantedSeed = new Entity({
            modelUri: plantInfo.seedModel,
            modelScale: plantInfo.seedScale,
            rigidBodyOptions: {
              enabled: true,
              type: RigidBodyType.FIXED,
            },
          });

          // Spawn the planted seed
          plantedSeed.spawn(world, plantData.plantPos);

          // Add to growing seeds map with adjusted start time
          const seedId = `${plantData.plantPos.x},${plantData.plantPos.y},${plantData.plantPos.z}`;
          growingSeeds.set(seedId, {
            entity: plantedSeed,
            startTime: adjustedStartTime,
            startScale: plantData.startScale,
            endScale: plantData.endScale,
            startY: plantData.startY,
            endY: plantData.endY,
            plantPos: plantData.plantPos,
            plantName: plantData.plantName,
          });

          // If the plant should be fully grown from offline time, complete it immediately
          if (originalElapsed >= plantInfo.growthTime) {
            // Remove from growing seeds immediately
            growingSeeds.delete(seedId);
            plantedSeed.despawn();

            // Create fully grown plant
            const plant = new Entity({
              modelUri: plantInfo.plantModel,
              modelScale: plantInfo.plantScale,
              modelLoopedAnimations: ["idle"],
              rigidBodyOptions: {
                enabled: true,
                type: RigidBodyType.FIXED,
              },
            });

            const finalRotation = {
              x: 0,
              y: Math.random() * Math.PI * 2,
              z: 0,
              w: 1,
            };

            plant.spawn(world, {
              ...plantData.plantPos,
              y: plantData.endY,
            });
            plant.setRotation(finalRotation);

            // Track this fully grown plant
            const plantKey = `${plantData.plantPos.x},${plantData.plantPos.y},${plantData.plantPos.z}`;
            fullyGrownPlants.set(plantKey, plant);

            // Notify player about offline growth
            world.chatManager.sendPlayerMessage(
              player,
              `🌱 Your ${plantInfo.name.replace(
                " Seed",
                ""
              )} grew while you were away! ${plantInfo.emoji}`,
              plantInfo.color
            );
          }
        }
      });

      console.log(
        `Loaded ${plants.length} growing plants for player ${
          player.id
        } (offline time: ${Math.round(offlineTime / 1000)}s)`
      );
      return plants.length;
    }
    // No growing plants data found - this is normal for new players
    console.log(`No growing plants data for player ${player.id}`);
    return 0;
  } catch (error: any) {
    // This is expected for new players when no data exists yet
    // Check if it's a file not found error (which is expected)
    if (error.code === "ENOENT" || error.message?.includes("no such file")) {
      console.log(
        `No growing plants data for player ${player.id} - starting fresh`
      );
      return 0;
    }
    // For other unexpected errors, log them
    console.error(
      `Unexpected error loading growing plants for ${player.id}:`,
      error
    );
    return 0;
  }
};

// Function to find next available garden for a player
const findNextAvailableGarden = (
  world: any
): {
  position: { x: number; y: number; z: number };
  gardenIndex: number;
} | null => {
  const searchRadius = 50; // Search in a larger area
  const centerX = 0;
  const centerY = 10;
  const centerZ = 0;

  // Scan for diamond blocks in a grid pattern
  for (let x = -searchRadius; x <= searchRadius; x += 5) {
    for (let y = -5; y <= 5; y++) {
      for (let z = -searchRadius; z <= searchRadius; z += 5) {
        const bx = centerX + x;
        const by = centerY + y;
        const bz = centerZ + z;

        if (world.chunkLattice.getBlockId({ x: bx, y: by, z: bz }) === 11) {
          const diamondKey = getDiamondKey(bx, by, bz);

          // Check if this garden is unclaimed
          if (!gardenOwnership.has(diamondKey)) {
            const gardenIndex = getOrAssignGardenIndex(diamondKey);
            return {
              position: { x: bx + 0.5, y: by + 0.5, z: bz + 0.5 },
              gardenIndex,
            };
          }
        }
      }
    }
  }

  return null;
};

// Function to claim garden for a returning player
const claimGardenForReturningPlayer = (
  player: any,
  world: any,
  playerEntity: any
) => {
  const availableGarden = findNextAvailableGarden(world);

  if (availableGarden) {
    const { position, gardenIndex } = availableGarden;
    const x = Math.floor(position.x);
    const y = Math.floor(position.y);
    const z = Math.floor(position.z);

    // Claim the garden
    const diamondKey = getDiamondKey(x, y, z);
    gardenOwnership.set(diamondKey, player.id);

    // Add garden to player's garden list
    const playerGardenList = playerGardens.get(player.id) || [];
    playerGardenList.push(diamondKey);
    playerGardens.set(player.id, playerGardenList);

    // Teleport player to their garden
    playerEntity.setPosition({
      x: position.x,
      y: position.y + 2,
      z: position.z,
    });

    // Send garden claimed notification
    player.ui.sendData({
      type: "garden_claimed_notification",
    });

    // Notify player
    world.chatManager.sendPlayerMessage(
      player,
      `Welcome back! Check out your Garden #${gardenIndex}!`,
      "00FF00"
    );

    return true;
  }

  return false;
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

// Helper function to generate diamond position key
function getDiamondKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

// Helper function to check if a position is near a claimed diamond
function getDiamondOwnerForPosition(
  x: number,
  y: number,
  z: number
): string | null {
  // Check all claimed diamonds to see if this position is within range
  for (const [diamondKey, ownerId] of gardenOwnership.entries()) {
    const parts = diamondKey.split(",");
    if (parts.length === 3) {
      const diamondX = parseInt(parts[0] || "0");
      const diamondY = parseInt(parts[1] || "0");
      const diamondZ = parseInt(parts[2] || "0");

      // Check if position is within 15 blocks of the diamond (much larger garden area)
      const distance = Math.sqrt(
        Math.pow(x - diamondX, 2) +
          Math.pow(y - diamondY, 2) +
          Math.pow(z - diamondZ, 2)
      );

      if (distance <= 15) {
        return ownerId;
      }
    }
  }
  return null;
}

// Function to get or assign garden index
function getOrAssignGardenIndex(diamondKey: string): number {
  if (!gardenIndices.has(diamondKey)) {
    gardenIndices.set(diamondKey, nextGardenIndex);
    nextGardenIndex++;
  }
  return gardenIndices.get(diamondKey) || 1;
}

// Function to reset garden indices (useful for testing)
function resetGardenIndices() {
  gardenIndices.clear();
  nextGardenIndex = 1;
}

// Function to get username by player ID
function getUsernameById(world: any, playerId: string): string {
  try {
    // Try to get the player from the world's player manager
    const allPlayers = world.playerManager?.getAllPlayers?.() || [];
    const ownerPlayer = allPlayers.find((p: any) => p.id === playerId);
    if (ownerPlayer?.username) {
      return ownerPlayer.username;
    }

    // Fallback: try to get from the current player if it matches
    if (world.currentPlayer?.id === playerId && world.currentPlayer?.username) {
      return world.currentPlayer.username;
    }

    return "Player";
  } catch (e) {
    return "Player";
  }
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

startServer(async (world) => {
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

  // Load global game data on startup
  await loadGlobalGameData();

  // Initialize garden boundary indicators for any existing claimed gardens
  // updateGardenBoundaryIndicators(world);

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
  world.on(PlayerEvent.JOINED_WORLD, async ({ player }) => {
    // Store player's username for garden ownership display
    playerUsernames.set(player.id, player.username || "Player");

    const playerEntity = new DefaultPlayerEntity({
      player,
      name: "Player",
    });
    playerEntity.spawn(world, { x: -65, y: 10, z: 10 });

    const existingHeldItem = playerHeldItems.get(player.id);
    if (existingHeldItem) {
      existingHeldItem.despawn();
      playerHeldItems.set(player.id, null);
      playerHeldItemNames.set(player.id, null);
    }

    // Try to load existing player data
    const existingData = await loadPlayerData(player);

    if (existingData) {
      // Restore player data
      playerInventories.set(player.id, existingData.inventory);
      playerCash.set(player.id, existingData.cash);

      // Load growing plants data
      await loadGrowingPlantsData(player, world);

      // Check if player had a garden and try to claim a new one
      const hadGarden =
        existingData.inventory.length > 0 || existingData.cash > 10;

      if (hadGarden) {
        // Try to claim a new garden for returning player
        const claimed = claimGardenForReturningPlayer(
          player,
          world,
          playerEntity
        );

        //   if (claimed) {
        //     // Teleport to garden position
        //     const availableGarden = findNextAvailableGarden(world);
        //     if (availableGarden) {
        //       playerEntity.spawn(world, {
        //         x: availableGarden.position.x,
        //         y: availableGarden.position.y + 2,
        //         z: availableGarden.position.z,
        //       });
        //     }
        //   } else {
        //     // Fallback spawn position
        //   //  playerEntity.spawn(world, { x: -65, y: 10, z: 10 });
        //   }
      }
      // else {
      //   // New player spawn
      //  // playerEntity.spawn(world, { x: -65, y: 10, z: 10 });
      // }

      // Send welcome back message
      world.chatManager.sendPlayerMessage(
        player,
        `Welcome back, ${existingData.username}!`,
        "00FF00"
      );
    } else {
      // New player - initialize with default values
      playerInventories.set(player.id, []);
      playerCash.set(player.id, 10);

      playerEntity.spawn(world, { x: -65, y: 10, z: 10 });

      // Send welcome message for new players
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
    }

    // Initialize held item references
    playerHeldItems.set(player.id, null);
    playerHeldItemNames.set(player.id, null);

    // Load UI and send initial inventory data
    player.ui.load("ui/index.html");
    updatePlayerInventoryUI(player, world);

    // Send initial cash data
    const cash = playerCash.get(player.id) || 0;
    player.ui.sendData({
      type: "cash_update",
      cash: cash,
    });

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
      let canHarvestPlant = false; // Add this flag to track if player can harvest

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
      let nearbyDiamond: RaycastData["nearbyDiamond"] = null;
      let minDiamondDistance = Infinity;
      const searchRadius = 10; // how far around the player we scan for diamonds
      // Scan for diamond blocks (ID = 11) near the player
      for (let x = -searchRadius; x <= searchRadius; x++) {
        for (let y = -2; y <= 2; y++) {
          for (let z = -searchRadius; z <= searchRadius; z++) {
            const bx = playerBlockX + x;
            const by = playerBlockY + y;
            const bz = playerBlockZ + z;
            if (world.chunkLattice.getBlockId({ x: bx, y: by, z: bz }) === 11) {
              // Calculate distance to diamond
              const dx = bx + 0.5 - playerPos.x;
              const dy = by + 0.5 - playerPos.y;
              const dz = bz + 0.5 - playerPos.z;
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (dist <= 10 && dist < minDiamondDistance) {
                minDiamondDistance = dist;
                const diamondKey = getDiamondKey(bx, by, bz);
                const ownerId = gardenOwnership.get(diamondKey) || null;
                const gardenIdx = getOrAssignGardenIndex(diamondKey);
                nearbyDiamond = {
                  position: { x: bx + 0.5, y: by + 0.5, z: bz + 0.5 },
                  isOwned: ownerId !== null,
                  ownerId,
                  gardenOwnerDisplay: null,
                  gardenIndex: gardenIdx,
                };
              }
            }
          }
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

          if (plantInfo) {
            const elapsed = Date.now() - seed.startTime;
            const progress = Math.min(
              (elapsed / plantInfo.growthTime) * 100,
              100
            );
            const fullyGrown = progress >= 100;

            // Check if this plant is in the player's garden
            const plantGardenOwner = getDiamondOwnerForPosition(
              seed.plantPos.x,
              seed.plantPos.y,
              seed.plantPos.z
            );
            const canHarvest = plantGardenOwner === player.id;

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
              nearbyPlant = {
                name: plantInfo.name,
                position: { ...seed.plantPos },
              };
              plantProgress = progress;
              isPlantFullyGrown = fullyGrown;
              canHarvestPlant = canHarvest && fullyGrown; // Only allow harvesting if fully grown and in player's garden
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
              // Check if this plant is in the player's garden
              const plantGardenOwner = getDiamondOwnerForPosition(
                entityPos.x,
                entityPos.y,
                entityPos.z
              );
              const canHarvest = plantGardenOwner === player.id;

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
                canHarvestPlant = canHarvest; // Allow harvesting if in player's garden
              }
            }
          }
        }
      });

      // Get currently held item
      const heldItem = playerHeldItemNames.get(player.id);

      // Send update to UI with debug logging
      let gardenOwnerDisplay = null;
      if (nearbyDiamond && nearbyDiamond.isOwned && nearbyDiamond.ownerId) {
        if (nearbyDiamond.ownerId === player.id) {
          gardenOwnerDisplay = "Your Garden";
        } else {
          // Get the owner's name from our stored usernames map
          const ownerName =
            playerUsernames.get(nearbyDiamond.ownerId) || "Player";
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
        canHarvestPlant,
        nearbyDiamond: nearbyDiamond
          ? { ...nearbyDiamond, gardenOwnerDisplay }
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
        raycastData?.nearbyDiamond && !raycastData.nearbyDiamond.isOwned;

      // If left mouse is pressed and we can claim garden
      if (player.input.ml && canClaimGarden) {
        // Check if player already owns a garden
        const playerGardenList = playerGardens.get(player.id) || [];
        if (playerGardenList.length > 0) {
          world.chatManager.sendPlayerMessage(
            player,
            "You already own a garden! You can only have one garden at a time.",
            "FF0000"
          );
          player.input.ml = false;
          return;
        }

        const garden = raycastData.nearbyDiamond;
        if (garden) {
          // Use the garden position directly
          const x = Math.floor(garden.position.x);
          const y = Math.floor(garden.position.y);
          const z = Math.floor(garden.position.z);

          // Claim the garden
          gardenOwnership.set(getDiamondKey(x, y, z), player.id);

          // Add garden to player's garden list
          playerGardenList.push(getDiamondKey(x, y, z));
          playerGardens.set(player.id, playerGardenList);

          // Get garden index
          const gardenIndex = getOrAssignGardenIndex(getDiamondKey(x, y, z));

          // Save global game data
          saveGlobalGameData();

          // Send garden claimed notification
          player.ui.sendData({
            type: "garden_claimed_notification",
          });

          // Notify player with their name
          world.chatManager.sendPlayerMessage(
            player,
            `${player.username} claimed Garden #${gardenIndex}! You can now plant seeds here.`,
            "00FF00"
          );

          // Cancel the input so we don't claim multiple times
          player.input.ml = false;
        }
      }
      // If left mouse is pressed and we can plant
      else if (player.input.ml && canPlant) {
        // Get the closest dirt position from our stored raycast data
        if (raycastData?.closestDirtPos && heldItem) {
          // Check if this dirt is in an owned garden
          const dirtPos = raycastData.closestDirtPos;
          const gardenOwner = getDiamondOwnerForPosition(
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
            const ownerName = playerUsernames.get(gardenOwner) || "Player";
            world.chatManager.sendPlayerMessage(
              player,
              `This garden belongs to ${ownerName}!`,
              "FF0000"
            );
            player.input.ml = false;
            return;
          }

          // Create a seed entity at the dirt position
          const plantPos = {
            x: dirtPos.x + 0.5, // Center on the block
            y: dirtPos.y + 0.3, // Increased from 0.1 to 0.3 for better visibility
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

          // Save player data after planting
          savePlayerData(player);
          saveGrowingPlantsData(player);

          // Notify player
          world.chatManager.sendPlayerMessage(
            player,
            `Planted ${heldItem}! 🌱`,
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
        } else if (!heldItem?.includes("Seed")) {
          world.chatManager.sendPlayerMessage(
            player,
            "You need to hold a seed to plant it!",
            "FF0000"
          );
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

          // Track this fully grown plant
          const plantKey = `${seed.plantPos.x},${seed.plantPos.y},${seed.plantPos.z}`;
          fullyGrownPlants.set(plantKey, plant);

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
        const raycastData = playerRaycastData.get(player.id);

        if (raycastData?.nearbyDiamond && !raycastData.nearbyDiamond.isOwned) {
          // Check if player already owns a garden
          const playerGardenList = playerGardens.get(player.id) || [];
          if (playerGardenList.length > 0) {
            world.chatManager.sendPlayerMessage(
              player,
              "You already own a garden! You can only have one garden at a time.",
              "FF0000"
            );
            return;
          }

          const garden = raycastData.nearbyDiamond;

          // Use the garden position directly
          const x = Math.floor(garden.position.x);
          const y = Math.floor(garden.position.y);
          const z = Math.floor(garden.position.z);

          // Claim the garden
          gardenOwnership.set(getDiamondKey(x, y, z), player.id);

          // Add garden to player's garden list
          playerGardenList.push(getDiamondKey(x, y, z));
          playerGardens.set(player.id, playerGardenList);

          // Get garden index
          const gardenIndex = getOrAssignGardenIndex(getDiamondKey(x, y, z));

          // Save global game data
          saveGlobalGameData();

          // Send garden claimed notification
          player.ui.sendData({
            type: "garden_claimed_notification",
          });

          // Notify player with their name
          world.chatManager.sendPlayerMessage(
            player,
            `${player.username} claimed Garden #${gardenIndex}! You can now plant seeds here.`,
            "00FF00"
          );
        } else {
          world.chatManager.sendPlayerMessage(
            player,
            "No unowned garden nearby to claim!",
            "FF0000"
          );
        }
      } else if (data.type === "plant_seed") {
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
          const gardenOwner = getDiamondOwnerForPosition(
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
            const ownerName = playerUsernames.get(gardenOwner) || "Player";
            world.chatManager.sendPlayerMessage(
              player,
              `This garden belongs to ${ownerName}!`,
              "FF0000"
            );
            player.input.ml = false;
            return;
          }

          // Create a seed entity at the dirt position
          const plantPos = {
            x: dirtPos.x + 0.5, // Center on the block
            y: dirtPos.y + 0.3, // Increased from 0.1 to 0.3 for better visibility
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

          // Save player data after planting
          savePlayerData(player);
          saveGrowingPlantsData(player);

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
        const raycastData = playerRaycastData.get(player.id);
        if (!raycastData?.nearbyPlant) {
          return;
        }

        // Check if player can harvest this plant
        if (!raycastData.canHarvestPlant) {
          world.chatManager.sendPlayerMessage(
            player,
            "You can only harvest plants in your own garden!",
            "FF0000"
          );
          return;
        }

        // First, try to find a growing seed by position
        const seedId = Array.from(growingSeeds.entries()).find(([_, seed]) => {
          const dx = seed.plantPos.x - raycastData.nearbyPlant!.position.x;
          const dy = seed.plantPos.y - raycastData.nearbyPlant!.position.y;
          const dz = seed.plantPos.z - raycastData.nearbyPlant!.position.z;
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          return distance < 0.1; // Use a small threshold for position matching
        })?.[0];

        if (seedId) {
          // Handle growing seed harvest
          const seed = growingSeeds.get(seedId);
          if (!seed) {
            return;
          }

          const plantInfo = Object.values(PLANT_TYPES).find(
            (info): info is PlantType => info.name === seed.plantName
          );

          if (!plantInfo) {
            return;
          }

          // Only allow harvesting if fully grown
          const elapsed = Date.now() - seed.startTime;
          if (elapsed < plantInfo.growthTime) {
            world.chatManager.sendPlayerMessage(
              player,
              "This plant is not ready to harvest yet!",
              "FF0000"
            );
            return;
          }

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

          // Save player data after harvesting
          savePlayerData(player);
          saveGrowingPlantsData(player);

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
          // First check if this plant is already being harvested (in fullyGrownPlants map)
          const plantKey = `${raycastData.nearbyPlant.position.x},${raycastData.nearbyPlant.position.y},${raycastData.nearbyPlant.position.z}`;
          const trackedPlant = fullyGrownPlants.get(plantKey);

          if (trackedPlant) {
            // Find the plant info based on the entity's model
            const entityModel = trackedPlant.modelUri;
            const plantInfo = Object.values(PLANT_TYPES).find(
              (info): info is PlantType => info.plantModel === entityModel
            );

            if (plantInfo) {
              // Remove the plant entity and untrack it
              trackedPlant.despawn();
              fullyGrownPlants.delete(plantKey);

              // Add harvested item to inventory
              const inventory = playerInventories.get(player.id) || [];
              const harvestedItem = plantInfo.name.replace(" Seed", "");
              inventory.push(harvestedItem);
              playerInventories.set(player.id, inventory);

              // Update inventory UI
              updatePlayerInventoryUI(player, world);

              // Save player data after harvesting
              savePlayerData(player);

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
              world.chatManager.sendPlayerMessage(
                player,
                "Unknown plant type!",
                "FF0000"
              );
            }
          } else {
            // Fallback: Find the plant entity at the nearby plant position
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
              // Find the plant info based on the entity's model
              const entityModel = plantEntity.modelUri;
              const plantInfo = Object.values(PLANT_TYPES).find(
                (info): info is PlantType => info.plantModel === entityModel
              );

              if (plantInfo) {
                // Remove the plant entity
                plantEntity.despawn();

                // Add harvested item to inventory
                const inventory = playerInventories.get(player.id) || [];
                const harvestedItem = plantInfo.name.replace(" Seed", "");
                inventory.push(harvestedItem);
                playerInventories.set(player.id, inventory);

                // Update inventory UI
                updatePlayerInventoryUI(player, world);

                // Save player data after harvesting
                savePlayerData(player);

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
                world.chatManager.sendPlayerMessage(
                  player,
                  "Unknown plant type!",
                  "FF0000"
                );
              }
            } else {
              world.chatManager.sendPlayerMessage(
                player,
                "No plant found to harvest!",
                "FF0000"
              );
            }
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
        playerHeldItems.set(player.id, null);
        playerHeldItemNames.set(player.id, null);
        updatePlayerInventoryUI(player, world, null);
        return;
      }

      if (selectedItem) {
        // Remove any currently held item
        if (currentHeldItem) {
          currentHeldItem.despawn();
          playerHeldItems.set(player.id, null);
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
              playerHeldItems.set(player.id, null);
              playerHeldItemNames.set(player.id, null);
              updatePlayerInventoryUI(player, world, null);
              world.chatManager.sendPlayerMessage(
                player,
                `Stopped holding ${selectedItem}`
              );
            }
          });
        }
      } else {
        world.chatManager.sendPlayerMessage(player, "No item in that slot!");
      }
    }

    // Clean up when player leaves
    player.on(PlayerEvent.LEFT_WORLD, async () => {
      // Save player data before leaving
      await savePlayerData(player);
      await saveGrowingPlantsData(player);

      clearInterval(tickInterval);
      clearInterval(growthInterval);
      clearInterval(dirtCheckInterval);
      playerRaycastData.delete(player.id);
      playerHeldItemNames.delete(player.id);
      playerCash.delete(player.id);
      playerUsernames.delete(player.id);

      // Clean up any fully grown plants that might be orphaned
      // This is a simple cleanup - in a more complex system you might want to track ownership
      // Note: We'll let the garbage collector handle entity cleanup for now
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

      // Save player data after buying
      savePlayerData(player);

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

    // Save player data after selling
    savePlayerData(player);

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

  // Add debug command to show all claimed gardens
  world.chatManager.registerCommand("/gardens", (player) => {
    if (gardenOwnership.size === 0) {
      world.chatManager.sendPlayerMessage(
        player,
        "No gardens are currently claimed.",
        "FFFF00"
      );
      return;
    }

    world.chatManager.sendPlayerMessage(
      player,
      `Found ${gardenOwnership.size} claimed gardens:`,
      "FFFF00"
    );

    gardenOwnership.forEach((ownerId, diamondKey) => {
      const parts = diamondKey.split(",");
      if (parts.length === 3) {
        const x = parseInt(parts[0] || "0");
        const y = parseInt(parts[1] || "0");
        const z = parseInt(parts[2] || "0");
        const gardenIndex = getOrAssignGardenIndex(diamondKey);

        world.chatManager.sendPlayerMessage(
          player,
          `Garden #${gardenIndex}: Diamond at (${x}, ${y}, ${z}) - Owner: ${ownerId}`,
          "FFFF00"
        );
      }
    });
  });

  // Add comprehensive help command
  world.chatManager.registerCommand("/help", (player) => {
    world.chatManager.sendPlayerMessage(
      player,
      "🌱 Grow a Garden - Available Commands:",
      "00FF00"
    );
    world.chatManager.sendPlayerMessage(
      player,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "FFFFFF"
    );

    // Economy commands
    world.chatManager.sendPlayerMessage(
      player,
      "💰 Economy Commands:",
      "FFD700"
    );
    world.chatManager.sendPlayerMessage(
      player,
      "  /buy <seed> - Buy seeds (carrot, melon, potato, cookie)",
      "FFFFFF"
    );
    world.chatManager.sendPlayerMessage(
      player,
      "  /sell - Sell all harvested plants for cash",
      "FFFFFF"
    );
    world.chatManager.sendPlayerMessage(
      player,
      "  /cash - Check your current cash balance",
      "FFFFFF"
    );

    // Inventory commands
    world.chatManager.sendPlayerMessage(
      player,
      "🎒 Inventory Commands:",
      "FFD700"
    );
    world.chatManager.sendPlayerMessage(
      player,
      "  /inventory - Show your current inventory",
      "FFFFFF"
    );
    world.chatManager.sendPlayerMessage(
      player,
      "  /hold <slot> - Hold an item from your inventory (0-8)",
      "FFFFFF"
    );

    // Garden commands
    world.chatManager.sendPlayerMessage(
      player,
      "🏡 Garden Commands:",
      "FFD700"
    );
    world.chatManager.sendPlayerMessage(
      player,
      "  /gardens - Show all claimed gardens and their locations",
      "FFFFFF"
    );
    world.chatManager.sendPlayerMessage(
      player,
      "  /abandon-garden - Abandon your current garden to claim a new one",
      "FFFFFF"
    );
    world.chatManager.sendPlayerMessage(
      player,
      "  /reset-garden-indices - Reset garden numbering (for testing)",
      "FFFFFF"
    );

    // Fun commands
    world.chatManager.sendPlayerMessage(player, "🎮 Fun Commands:", "FFD700");
    world.chatManager.sendPlayerMessage(
      player,
      "  /rocket - Launch yourself into the air!",
      "FFFFFF"
    );
    world.chatManager.sendPlayerMessage(
      player,
      "  /reset-camera - Reset your camera if it gets stuck",
      "FFFFFF"
    );

    // Gameplay tips
    world.chatManager.sendPlayerMessage(player, "💡 Gameplay Tips:", "FFD700");
    world.chatManager.sendPlayerMessage(
      player,
      "  • Find diamond blocks to claim gardens",
      "FFFFFF"
    );
    world.chatManager.sendPlayerMessage(
      player,
      "  • Plant seeds on dirt blocks in your claimed garden",
      "FFFFFF"
    );
    world.chatManager.sendPlayerMessage(
      player,
      "  • Harvest fully grown plants with E key",
      "FFFFFF"
    );
    world.chatManager.sendPlayerMessage(
      player,
      "  • Use number keys 1-9 to quickly select inventory slots",
      "FFFFFF"
    );

    // Seed information
    world.chatManager.sendPlayerMessage(
      player,
      "🌱 Available Seeds:",
      "FFD700"
    );
    Object.entries(PLANT_TYPES).forEach(([seedKey, info]) => {
      const growthSeconds = Math.round(info.growthTime / 1000);
      world.chatManager.sendPlayerMessage(
        player,
        `  • ${info.name}: $${info.cost}, grows in ${growthSeconds}s, sells for $${info.sellPrice}`,
        info.color
      );
    });
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

  // Add command to abandon current garden
  world.chatManager.registerCommand("/abandon-garden", (player) => {
    const playerGardenList = playerGardens.get(player.id) || [];

    if (playerGardenList.length === 0) {
      world.chatManager.sendPlayerMessage(
        player,
        "You don't own any gardens to abandon.",
        "FF0000"
      );
      return;
    }

    // Remove all gardens owned by this player
    playerGardenList.forEach((diamondKey) => {
      gardenOwnership.delete(diamondKey);
    });

    // Clear player's garden list
    playerGardens.set(player.id, []);

    // Save global game data
    saveGlobalGameData();

    world.chatManager.sendPlayerMessage(
      player,
      "Garden abandoned! You can now claim a new garden.",
      "FFA500"
    );
  });

  // Add command to give player 100 cash for testing
  world.chatManager.registerCommand("/addcash", (player) => {
    const currentCash = playerCash.get(player.id) || 0;
    const newCash = currentCash + 100;
    playerCash.set(player.id, newCash);
    player.ui.sendData({
      type: "cash_update",
      cash: newCash,
    });
    world.chatManager.sendPlayerMessage(
      player,
      "You have been given 100 cash for testing. New balance: " + newCash,
      "00FF00"
    );
    savePlayerData(player);
  });
});
