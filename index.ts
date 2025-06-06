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
} from "hytopia";
import type { RaycastHit } from "hytopia";

import worldMap from "./assets/map.json";

// Add inventory system
const playerInventories = new Map<string, string[]>();
const playerHeldItems = new Map<string, Entity | null>();
const playerHeldItemNames = new Map<string, string | null>();

// Add at the top with other state variables
const playerRaycastData = new Map<
  string,
  {
    lookingAtDirt: boolean;
    heldItem: string | null;
    closestDirtPos: { x: number; y: number; z: number } | null;
  }
>();

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
};

type PlantTypes = {
  [key: string]: PlantType;
};

const PLANT_TYPES: PlantTypes = {
  "carrot-seed": {
    name: "Carrot Seed",
    seedModel: "models/items/stick.gltf",
    plantModel: "models/items/bone.gltf",
    seedScale: 0.3,
    plantScale: 1.2,
    growthTime: 4000, // 4 seconds
    finalHeight: 0.5,
    color: "FFA500", // Orange
    emoji: "🥕",
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

    const playerEntity = new DefaultPlayerEntity({
      player,
      name: "Player",
    });

    playerEntity.spawn(world, { x: -65, y: 10, z: 10 });

    // Load UI and send initial inventory data
    player.ui.load("ui/index.html");
    updatePlayerInventoryUI(player, world);

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

    // Add distance-based dirt detection
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

      // Check blocks in a 3x3x3 area around the player
      let lookingAtDirt = false;
      let closestDirtPos = null;
      let minDistance = Infinity;
      const checkRadius = 2; // Check 2 blocks in each direction

      for (let x = -checkRadius; x <= checkRadius; x++) {
        for (let y = -checkRadius; y <= checkRadius; y++) {
          for (let z = -checkRadius; z <= checkRadius; z++) {
            const blockX = playerBlockX + x;
            const blockY = playerBlockY + y;
            const blockZ = playerBlockZ + z;

            // Get block type at this position
            const blockType = world.chunkLattice.getBlockId({
              x: blockX,
              y: blockY,
              z: blockZ,
            });

            if (blockType === 13) {
              // 13 is dirt block ID
              // Calculate distance to this dirt block
              const dx = blockX + 0.5 - playerPos.x; // +0.5 to get center of block
              const dy = blockY + 0.5 - playerPos.y;
              const dz = blockZ + 0.5 - playerPos.z;
              const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

              // If we're close enough to the dirt block
              if (distance <= 3) {
                // 3 blocks maximum distance
                lookingAtDirt = true;
                // Keep track of closest dirt block
                if (distance < minDistance) {
                  minDistance = distance;
                  closestDirtPos = { x: blockX, y: blockY, z: blockZ };
                }
              }
            }
          }
        }
      }

      // Get currently held item
      const heldItem = playerHeldItemNames.get(player.id);

      // Send update to UI
      const raycastData = {
        lookingAtDirt,
        heldItem: heldItem || null,
        closestDirtPos,
      } as const;

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

      // make this only print if ml is true
      if (player.input.ml) {
        console.log("Server: Can plant:", canPlant);
      }

      // If left mouse is pressed and we can plant
      if (player.input.ml && canPlant) {
        console.log("Server: Planting seed from input");

        // Get the closest dirt position from our stored raycast data
        if (raycastData?.closestDirtPos && heldItem) {
          const plantPos = {
            x: raycastData.closestDirtPos.x + 0.5,
            y: raycastData.closestDirtPos.y + 1,
            z: raycastData.closestDirtPos.z + 0.5,
          };

          const plantInfo = Object.values(PLANT_TYPES).find(
            (info): info is PlantType => info.name === heldItem
          );

          if (!plantInfo) {
            console.error("Unknown plant type:", heldItem);
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
          // Create a seed entity at the dirt position
          const plantPos = {
            x: raycastData.closestDirtPos.x + 0.5, // Center on the block
            y: raycastData.closestDirtPos.y + 0.1, // Slightly above the dirt
            z: raycastData.closestDirtPos.z + 0.5, // Center on the block
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

          // Remove the seed from inventory
          inventory.splice(heldItemIndex, 1);
          playerInventories.set(player.id, inventory);

          // Despawn the held seed if it exists
          if (heldItem) {
            heldItem.despawn();
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

    // Function to handle holding items (used by both UI and command)
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
        return; // The despawn event will handle the UI update and message
      }

      if (selectedItem) {
        // Remove any currently held item
        if (currentHeldItem) {
          // Don't send message here, it will be sent by the despawn event
          currentHeldItem.despawn();
          playerHeldItemNames.set(player.id, null);
        }

        // Create new item
        const itemEntity = createSeedItem();

        // Get player's position and rotation
        const playerPos = playerEntity.position;
        const playerRot = playerEntity.rotation;

        // Calculate hand position
        const handOffset = {
          x: 0, // Center
          y: -0.5, // At hand height
          z: -0.5, // In front of player
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
        world.chatManager.sendPlayerMessage(player, `Holding ${selectedItem}`);

        // Add event listener for when item is despawned
        itemEntity.on(EntityEvent.DESPAWN, () => {
          // Only send message if this is the currently held item
          if (playerHeldItems.get(player.id) === itemEntity) {
            // Update inventory UI to show item is no longer held
            updatePlayerInventoryUI(player, world, null);
            world.chatManager.sendPlayerMessage(
              player,
              `Stopped holding ${selectedItem}`
            );
            // Clear the held item references
            playerHeldItems.set(player.id, null);
            playerHeldItemNames.set(player.id, null);
          }
        });
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
    });
  });

  // Update buy command to handle all seed types
  world.chatManager.registerCommand("/buy", (player, args) => {
    if (!args[0]) {
      const plantList = Object.entries(PLANT_TYPES)
        .map(([type, info]) => {
          const growthTimeInSeconds = info.growthTime / 1000;
          return `${type.replace("-seed", "")} (${growthTimeInSeconds}s)`;
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

      // Get player's inventory
      const inventory = playerInventories.get(player.id) || [];

      // Add seed to inventory
      inventory.push(plantInfo.name);
      playerInventories.set(player.id, inventory);

      // Update the inventory UI
      updatePlayerInventoryUI(player, world);

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
        `You bought a ${plantInfo.name}! 🌱 (Growth time: ${growthTimeInSeconds} seconds)`,
        "00FF00"
      );
      world.chatManager.sendPlayerMessage(
        player,
        "Use /hold <slot> to hold an item (e.g. /hold 0)"
      );
    } else {
      const plantList = Object.entries(PLANT_TYPES)
        .map(([type, info]) => {
          const growthTimeInSeconds = info.growthTime / 1000;
          return `${type.replace("-seed", "")} (${growthTimeInSeconds}s)`;
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
