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

import worldMap from "./assets/map.json";

// Add inventory system
const playerInventories = new Map<string, string[]>();
const playerHeldItems = new Map<string, Entity | null>();

// Create seed item entity
const createSeedItem = () => {
  return new Entity({
    modelUri: "models/items/stick.gltf", // Using stick model as placeholder for seeds
    modelScale: 0.3, // Make it smaller since it's a seed
    rigidBodyOptions: {
      enabled: false, // Disable physics completely
      enabledRotations: { x: false, y: true, z: false },
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
      rigidBodyOptions: {
        enabledRotations: { x: false, y: true, z: false }, // Only allow rotations around Y axis (Yaw)
      },
    });

    // We need to make the entity rotate 90 degrees around the Y axis
    skeletonSeedSeller.setRotation({ x: 0, y: -Math.PI / 2, z: 0, w: 1 });
    // Just like the player entity, we can spawn the skeleton entity
    skeletonSeedSeller.spawn(world, { x: -74, y: 10, z: 10 });

    player.ui.on(PlayerUIEvent.DATA, ({ playerUI, data }) => {
      if (data.type === "hold") {
        handleItemHold(player, world, playerEntity, data.index);
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
        return; // The despawn event will handle the UI update and message
      }

      if (selectedItem) {
        // Remove any currently held item
        if (currentHeldItem) {
          // Don't send message here, it will be sent by the despawn event
          currentHeldItem.despawn();
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

        // Store the item entity and update held item index
        playerHeldItems.set(player.id, itemEntity);

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
            // Clear the held item reference
            playerHeldItems.set(player.id, null);
          }
        });
      } else {
        world.chatManager.sendPlayerMessage(player, "No item in that slot!");
      }
    }
  });

  // Update buy command to handle seeds
  world.chatManager.registerCommand("/buy", (player, args) => {
    if (!args[0]) {
      world.chatManager.sendPlayerMessage(
        player,
        "Please specify what you want to buy (e.g. /buy carrot-seed)"
      );
      return;
    }

    const item = args[0].toLowerCase();
    if (item === "carrot" || item === "carrot-seed") {
      // Get player's inventory
      const inventory = playerInventories.get(player.id) || [];

      // Add carrot seed to inventory
      inventory.push("Carrot Seed"); // Capitalize the item name for display
      playerInventories.set(player.id, inventory);

      // Update the inventory UI with the new inventory data
      updatePlayerInventoryUI(player, world);

      // Spawn a visual seed entity that follows the player briefly
      const seed = createSeedItem();
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

      world.chatManager.sendPlayerMessage(
        player,
        "You bought a carrot seed! 🌱",
        "00FF00"
      );
      world.chatManager.sendPlayerMessage(
        player,
        "Use /hold <slot> to hold an item (e.g. /hold 0)"
      );
    } else {
      world.chatManager.sendPlayerMessage(
        player,
        "Sorry, that item is not available for purchase."
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
