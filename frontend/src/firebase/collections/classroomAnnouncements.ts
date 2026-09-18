/**
 * classroomAnnouncements.ts
 *
 * Firebase collection: "classroom_announcements"
 *
 * This is a BROADCAST collection — documents are visible to all authenticated
 * students. It is intentionally separate from the per-user "notifications"
 * collection so classroom-wide messages are not polluted into individual
 * notification feeds.
 *
 * Write access should be restricted to admin / moderator roles in Firestore
 * Security Rules:
 *
 *   match /classroom_announcements/{docId} {
 *     allow read: if request.auth != null;
 *     allow write: if request.auth != null
 *       && get(/databases/$(database)/documents/user_roles/$(request.auth.uid)).data.role
 *            in ["admin", "moderator"];
 *   }
 */

import { db } from "@/integrations/firebase/client";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnnouncementType =
  | "normal"
  | "important"
  | "urgent"
  | "assignment"
  | "class_start"
  | "class_end"
  | "emergency";

export interface ClassroomAnnouncement {
  id: string;
  message: string;
  type: AnnouncementType;
  senderName: string;
  senderId: string;
  createdAt: Timestamp | null;
  /** UIDs of students who have acknowledged this announcement */
  acknowledged: string[];
  /** Optional TTL — if present and in the past the UI hides the item */
  expiresAt?: Timestamp | null;
}

export type NewAnnouncement = Omit<ClassroomAnnouncement, "id" | "createdAt" | "acknowledged">;

// ─── Collection ref helper ────────────────────────────────────────────────────

const COLLECTION = "classroom_announcements";
const announcementsRef = () => collection(db, COLLECTION);

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Send a new classroom announcement.
 * Only admin / moderator users should call this (enforced by Firestore rules).
 */
export const sendAnnouncement = async (data: NewAnnouncement): Promise<string> => {
  const docRef = await addDoc(announcementsRef(), {
    ...data,
    acknowledged: [],
    createdAt: serverTimestamp(),
  });
  return docRef.id;
};

/**
 * Delete an announcement by ID.
 * Only admin / moderator users should call this.
 */
export const deleteAnnouncement = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, COLLECTION, id));
};

// ─── Real-time listener ───────────────────────────────────────────────────────

/**
 * Subscribe to the latest classroom announcements in real time.
 *
 * @param maxItems  Maximum number of announcements to fetch (default 50)
 * @param onData    Called whenever announcements change
 * @param onError   Called on Firestore error
 * @returns         Unsubscribe function — call on component unmount
 */
export const subscribeToAnnouncements = (
  onData: (announcements: ClassroomAnnouncement[]) => void,
  onError?: (error: Error) => void,
  maxItems = 50,
): Unsubscribe => {
  const q = query(
    announcementsRef(),
    orderBy("createdAt", "desc"),
    limit(maxItems),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ClassroomAnnouncement[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ClassroomAnnouncement, "id">),
      }));
      onData(items);
    },
    (error) => {
      console.error("[EduCaption] classroomAnnouncements listener error:", error);
      onError?.(error);
    },
  );
};
