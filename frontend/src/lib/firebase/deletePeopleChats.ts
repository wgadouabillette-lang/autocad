import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  writeBatch,
  type CollectionReference,
} from "firebase/firestore";
import { db } from "./client";

const BATCH_SIZE = 450;

async function deleteCollection(coll: CollectionReference): Promise<void> {
  while (true) {
    const snap = await getDocs(query(coll, limit(BATCH_SIZE)));
    if (snap.empty) return;
    const batch = writeBatch(db);
    for (const docSnap of snap.docs) {
      batch.delete(docSnap.ref);
    }
    await batch.commit();
    if (snap.size < BATCH_SIZE) return;
  }
}

export async function deleteFriendChat(chatId: string): Promise<void> {
  await deleteCollection(collection(db, "friendChats", chatId, "messages"));
  await deleteDoc(doc(db, "friendChats", chatId));
}

export async function deleteGroupChat(groupId: string): Promise<void> {
  await deleteCollection(collection(db, "groupChats", groupId, "messages"));
  await deleteDoc(doc(db, "groupChats", groupId));
}
