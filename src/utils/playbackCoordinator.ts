/**
 * Global Playback Coordinator for Lolixco.
 *
 * Ensures single-active-player audio exclusivity across:
 * - Featured Landscape VideoPlayer
 * - ShortsViewer
 * - ImmersionViewer
 * - Embedded YouTube players
 */

type PauseCallback = () => void;

class PlaybackCoordinator {
  private activePlayerId: string | null = null;
  private players = new Map<string, PauseCallback>();

  /**
   * Registers a player instance with its pause callback.
   * Returns an unregister cleanup function.
   */
  registerPlayer(id: string, pause: PauseCallback): () => void {
    this.players.set(id, pause);
    return () => {
      this.players.delete(id);
      if (this.activePlayerId === id) {
        this.activePlayerId = null;
      }
    };
  }

  /**
   * Notifies the coordinator that a player has commenced playback.
   * Immediately pauses any other currently active player.
   */
  notifyPlaying(id: string): void {
    if (this.activePlayerId && this.activePlayerId !== id) {
      const pausePrev = this.players.get(this.activePlayerId);
      if (pausePrev) {
        try {
          pausePrev();
        } catch {
          // Guard against dismantled players
        }
      }
    }
    this.activePlayerId = id;
  }

  /**
   * Notifies the coordinator that a player has paused.
   */
  notifyPaused(id: string): void {
    if (this.activePlayerId === id) {
      this.activePlayerId = null;
    }
  }

  /**
   * Pauses all registered players (e.g., when opening modals or navigating away).
   */
  pauseAll(): void {
    for (const pause of this.players.values()) {
      try {
        pause();
      } catch {
        // Guard against dismantled players
      }
    }
    this.activePlayerId = null;
  }

  /**
   * Returns the ID of the currently playing player, or null if idle.
   */
  getActivePlayerId(): string | null {
    return this.activePlayerId;
  }
}

export const playbackCoordinator = new PlaybackCoordinator();
