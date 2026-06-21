import type {
  UserProfile,
  Friend,
  PartyMode,
  VitalsTick,
  MemoryItem,
  ChatMessage,
} from "@drunk-buddy/shared";
import { type Store, type UserLocation, VITALS_CAP, CONVO_CAP } from "./store";

// In-memory Store — zero setup, used when REDIS_URL is not set.
export class MemoryStore implements Store {
  private profiles = new Map<string, UserProfile>();
  private friends = new Map<string, Friend[]>();
  private blocklists = new Map<string, string[]>();
  private parties = new Map<string, PartyMode>();
  private vitals = new Map<string, VitalsTick[]>();
  private memories = new Map<string, MemoryItem[]>();
  private lastSeen = new Map<string, number>();
  private chatGuids = new Map<string, string>();
  private locations = new Map<string, UserLocation>();
  private convos = new Map<string, ChatMessage[]>();

  async getProfile(phone: string) {
    return this.profiles.get(phone) ?? null;
  }
  async setProfile(phone: string, profile: UserProfile) {
    this.profiles.set(phone, profile);
  }

  async getFriends(phone: string) {
    return this.friends.get(phone) ?? [];
  }
  async addFriend(phone: string, friend: Friend) {
    const arr = this.friends.get(phone) ?? [];
    arr.push(friend);
    this.friends.set(phone, arr);
  }

  async getBlocklist(phone: string) {
    return this.blocklists.get(phone) ?? [];
  }
  async addBlocklist(phone: string, name: string) {
    const arr = this.blocklists.get(phone) ?? [];
    if (!arr.includes(name)) arr.push(name);
    this.blocklists.set(phone, arr);
  }

  async getParty(phone: string) {
    return this.parties.get(phone) ?? { active: false };
  }
  async setParty(phone: string, party: PartyMode) {
    this.parties.set(phone, party);
  }

  async pushVitals(phone: string, tick: VitalsTick) {
    const arr = this.vitals.get(phone) ?? [];
    arr.push(tick);
    while (arr.length > VITALS_CAP) arr.shift();
    this.vitals.set(phone, arr);
  }
  async getVitals(phone: string) {
    return this.vitals.get(phone) ?? [];
  }

  async addMemory(phone: string, fact: string) {
    const arr = this.memories.get(phone) ?? [];
    arr.push({ ts: Date.now(), fact });
    this.memories.set(phone, arr);
  }
  async recallMemory(phone: string, query?: string) {
    const arr = this.memories.get(phone) ?? [];
    if (!query) return arr;
    const q = query.toLowerCase();
    return arr.filter((m) => m.fact.toLowerCase().includes(q));
  }

  async getLastSeen(phone: string) {
    return this.lastSeen.get(phone) ?? null;
  }
  async setLastSeen(phone: string, ts: number) {
    this.lastSeen.set(phone, ts);
  }

  async getChatGuid(phone: string) {
    return this.chatGuids.get(phone) ?? null;
  }
  async setChatGuid(phone: string, chatGuid: string) {
    this.chatGuids.set(phone, chatGuid);
  }

  async getLocation(phone: string) {
    return this.locations.get(phone) ?? null;
  }
  async setLocation(phone: string, loc: UserLocation) {
    this.locations.set(phone, loc);
  }

  async getConversation(phone: string) {
    return this.convos.get(phone) ?? [];
  }
  async appendConversation(phone: string, msg: ChatMessage) {
    const arr = this.convos.get(phone) ?? [];
    arr.push(msg);
    while (arr.length > CONVO_CAP) arr.shift();
    this.convos.set(phone, arr);
  }
}
