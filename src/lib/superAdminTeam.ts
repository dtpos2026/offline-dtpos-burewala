// Super Admin Team — roles, permissions, cloud helpers
import { cloudDb } from './offlineNoCloud';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, serverTimestamp, addDoc, query, orderBy, limit as fsLimit, writeBatch } from '@/lib/offlineNoCloud';
import { SUPER_ADMIN_EMAILS } from './offlineNoCloud';

export type SuperAdminRole =
  | 'owner'
  | 'support'
  | 'sales'
  | 'billing'
  | 'technical';

export interface TeamMember {
  email: string;          // lowercased; doc id
  name?: string;
  role: SuperAdminRole;
  active: boolean;
  createdAt?: any;
  createdBy?: string;
  lastLoginAt?: any;
}

export const ROLE_LABELS: Record<SuperAdminRole, string> = {
  owner: 'Owner Super Admin',
  support: 'Support Admin',
  sales: 'Sales Admin',
  billing: 'Billing Admin',
  technical: 'Technical Admin',
};

export const ROLE_DESCRIPTIONS: Record<SuperAdminRole, string> = {
  owner: 'Full access to everything',
  support: 'Restaurants, devices & modules',
  sales: 'Onboarding & new restaurants',
  billing: 'Plans, payments & expiry',
  technical: 'Errors, logs & system health',
};

export interface Permissions {
  manageTeam: boolean;
  manageRestaurants: boolean;
  manageDevices: boolean;
  managePlans: boolean;
  viewLogs: boolean;
  viewMap: boolean;
}

export function permissionsFor(role: SuperAdminRole): Permissions {
  switch (role) {
    case 'owner':
      return { manageTeam: true, manageRestaurants: true, manageDevices: true, managePlans: true, viewLogs: true, viewMap: true };
    case 'support':
      return { manageTeam: false, manageRestaurants: true, manageDevices: true, managePlans: false, viewLogs: true, viewMap: true };
    case 'sales':
      return { manageTeam: false, manageRestaurants: true, manageDevices: false, managePlans: false, viewLogs: false, viewMap: true };
    case 'billing':
      return { manageTeam: false, manageRestaurants: true, manageDevices: false, managePlans: true, viewLogs: true, viewMap: false };
    case 'technical':
      return { manageTeam: false, manageRestaurants: false, manageDevices: true, managePlans: false, viewLogs: true, viewMap: true };
  }
}

const TEAM_COL = 'superAdminTeam';
const ACTIVITY_COL = 'superAdminActivity';

function emailKey(email: string) {
  return email.trim().toLowerCase();
}

export function isHardcodedOwner(email?: string | null): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase());
}

/** Returns the active super admin role for this email, or null if not a super admin. */
export async function fetchSuperAdminRole(email?: string | null): Promise<SuperAdminRole | null> {
  if (!email) return null;
  if (isHardcodedOwner(email)) return 'owner';
  try {
    const snap = await getDoc(doc(cloudDb(), TEAM_COL, emailKey(email)));
    if (!snap.exists()) return null;
    const data = snap.data() as TeamMember;
    if (data.active === false) return null;
    return data.role;
  } catch {
    return null;
  }
}

export async function listTeam(): Promise<TeamMember[]> {
  const snap = await getDocs(collection(cloudDb(), TEAM_COL));
  const list: TeamMember[] = [];
  snap.forEach(d => list.push({ email: d.id, ...(d.data() as any) }));
  list.sort((a, b) => a.email.localeCompare(b.email));
  return list;
}

export async function saveTeamMember(m: Omit<TeamMember, 'createdAt'> & { createdBy?: string }): Promise<void> {
  const id = emailKey(m.email);
  const ref = doc(cloudDb(), TEAM_COL, id);
  const existing = await getDoc(ref);
  await setDoc(ref, {
    email: id,
    name: m.name || '',
    role: m.role,
    active: m.active !== false,
    createdAt: existing.exists() ? (existing.data() as any).createdAt : serverTimestamp(),
    createdBy: existing.exists() ? (existing.data() as any).createdBy : (m.createdBy || ''),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function removeTeamMember(email: string): Promise<void> {
  await deleteDoc(doc(cloudDb(), TEAM_COL, emailKey(email)));
}

export async function setMemberActive(email: string, active: boolean): Promise<void> {
  await setDoc(doc(cloudDb(), TEAM_COL, emailKey(email)), { active, updatedAt: serverTimestamp() }, { merge: true });
}

export async function recordLogin(email: string): Promise<void> {
  if (isHardcodedOwner(email)) return;
  try {
    await setDoc(doc(cloudDb(), TEAM_COL, emailKey(email)), { lastLoginAt: serverTimestamp() }, { merge: true });
  } catch {}
}

export interface ActivityEntry {
  id?: string;
  actorEmail: string;
  actorRole?: SuperAdminRole;
  action: string;
  target?: string;
  meta?: any;
  at?: any;
}

export async function logActivity(entry: Omit<ActivityEntry, 'at' | 'id'>): Promise<void> {
  try {
    await addDoc(collection(cloudDb(), ACTIVITY_COL), { ...entry, at: serverTimestamp() });
  } catch {}
}

export async function recentActivity(max = 100): Promise<ActivityEntry[]> {
  try {
    const q = query(collection(cloudDb(), ACTIVITY_COL), orderBy('at', 'desc'), fsLimit(max));
    const snap = await getDocs(q);
    const list: ActivityEntry[] = [];
    snap.forEach(d => list.push({ id: d.id, ...(d.data() as any) }));
    return list;
  } catch {
    return [];
  }
}

export async function deleteActivity(id: string): Promise<void> {
  await deleteDoc(doc(cloudDb(), ACTIVITY_COL, id));
}

export async function clearAllActivity(): Promise<void> {
  const snap = await getDocs(collection(cloudDb(), ACTIVITY_COL));
  const batch = writeBatch(cloudDb());
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
}
