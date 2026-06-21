import Redis from "ioredis";
import type {
  UserProfile,
  Friend,
  PartyMode,
  VitalsTick,
  MemoryItem,
  ChatMessage,
} from "@drunk-buddy/shared";
import { type Store, VITALS_CAP, CONVO_CAP } from "./store";

// Redis-backed Store. Keys follow the data model in CLAUDE.md / PLAN.md (§5).
export class RedisStore implements Store {
  private r: Redis;

  constructor(url: string) {
    this.r = new Redis(url);
  }

  private async getJson<T>(key: string, fallback: T): Promise<T> {
    const v = await this.r.get(key);
    return v ? (JSON.parse(v) as T) : fallback;
  }
  private async setJson(key: string, val: unknown): Promise<void> {
    await this.r.set(key, JSON.stringify(val));
  }

  async getProfile(phone: string) {
    return this.getJson<UserProfile | null>(`user:${phone}`, null);
  }
  async setProfile(phone: string, profile: UserProfile) {
    await this.setJson(`user:${phone}`, profile);
  }

  async getFriends(phone: string) {
    return this.getJson<Friend[]>(`friends:${phone}`, []);
  }
  async addFriend(phone: string, friend: Friend) {
    const arr = await this.getFriends(phone);
    arr.push(friend);
    await this.setJson(`friends:${phone}`, arr);
  }

  async getBlocklist(phone: string) {
    return this.getJson<string[]>(`blocklist:${phone}`, []);
  }
  async addBlocklist(phone: string, name: string) {
    const arr = await this.getBlocklist(phone);
    if (!arr.includes(name)) arr.push(name);
    await this.setJson(`blocklist:${phone}`, arr);
  }

  async getParty(phone: string) {
    return this.getJson<PartyMode>(`party:${phone}`, { active: false });
  }
  async setParty(phone: string, party: PartyMode) {
    await this.setJson(`party:${phone}`, party);
  }

  async pushVitals(phone: string, tick: VitalsTick) {
    const arr = await this.getVitals(phone);
    arr.push(tick);
    while (arr.length > VITALS_CAP) arr.shift();
    await this.setJson(`vitals:${phone}`, arr);
  }
  async getVitals(phone: string) {
    return this.getJson<VitalsTick[]>(`vitals:${phone}`, []);
  }

  async addMemory(phone: string, fact: string) {
    const arr = await this.getJson<MemoryItem[]>(`memory:${phone}`, []);
    arr.push({ ts: Date.now(), fact });
    await this.setJson(`memory:${phone}`, arr);
  }
  async recallMemory(phone: string, query?: string) {
    const arr = await this.getJson<MemoryItem[]>(`memory:${phone}`, []);
    if (!query) return arr;
    const q = query.toLowerCase();
    return arr.filter((m) => m.fact.toLowerCase().includes(q));
  }

  async getLastSeen(phone: string) {
    const v = await this.r.get(`lastseen:${phone}`);
    return v ? Number(v) : null;
  }
  async setLastSeen(phone: string, ts: number) {
    await this.r.set(`lastseen:${phone}`, String(ts));
  }

  async getChatGuid(phone: string) {
    return this.r.get(`chatguid:${phone}`);
  }
  async setChatGuid(phone: string, chatGuid: string) {
    await this.r.set(`chatguid:${phone}`, chatGuid);
  }

  async getConversation(phone: string) {
    return this.getJson<ChatMessage[]>(`convo:${phone}`, []);
  }
  async appendConversation(phone: string, msg: ChatMessage) {
    const arr = await this.getConversation(phone);
    arr.push(msg);
    while (arr.length > CONVO_CAP) arr.shift();
    await this.setJson(`convo:${phone}`, arr);
  }
}
