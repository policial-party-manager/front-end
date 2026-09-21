export interface SessionSnapshot {
  generation: number;
  refreshToken: string;
}

/** 会话状态变更后，让在途请求携带的旧快照失效。 */
export class SessionFence {
  private generation = 0;

  advance(): number {
    this.generation += 1;
    return this.generation;
  }

  capture(refreshToken: string): SessionSnapshot {
    return { generation: this.generation, refreshToken };
  }

  isCurrent(snapshot: SessionSnapshot, currentRefreshToken: string): boolean {
    return snapshot.generation === this.generation && snapshot.refreshToken === currentRefreshToken;
  }

  same(left: SessionSnapshot, right: SessionSnapshot): boolean {
    return left.generation === right.generation && left.refreshToken === right.refreshToken;
  }
}

export const sessionFence = new SessionFence();
