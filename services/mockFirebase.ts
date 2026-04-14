// Firebase Firestore Service - Real database for persistent data
import { User, Comment, BlogPost } from '../types';
import { db, auth } from './firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
  query,
  where,
  serverTimestamp,
  Timestamp,
  writeBatch
} from 'firebase/firestore';

/**
 * Asserts that Firebase Auth has a current user before attempting a Firestore
 * write that is gated by security rules (`request.auth != null`).  Throws a
 * user-friendly error when the session is missing so callers can surface it.
 */
function requireAuth(): void {
  if (!auth.currentUser) {
    throw new Error(
      'NOT_AUTHENTICATED: Your session has expired or Firebase authentication was not established. Please sign out and sign in again.'
    );
  }
}

/** Firestore rejects `undefined` anywhere in document data — strip recursively before writes. */
function omitUndefinedDeep<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => omitUndefinedDeep(item)) as T;
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) {
      result[k] = omitUndefinedDeep(v);
    }
  }
  return result as T;
}

// Collection names
const COLLECTIONS = {
  SUBSCRIBERS: 'subscribers',
  COMMENTS: 'comments',
  LIKES: 'likes',
  POSTS: 'posts',
  REACTIONS: 'reactions',
  PAGE_VIEWS: 'pageViews',
  META: 'meta'
};

// Subscriber counter document path
const SUBSCRIBER_COUNTER_DOC = 'subscriberCount';

// --- Firestore Service: Subscribers ---

export const subscribeUser = async (email: string): Promise<{ isNewSubscriber: boolean }> => {
  // Basic email format validation before writing to Firestore
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new Error('Please enter a valid email address.');
  }
  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Check if already subscribed
    const subscribersRef = collection(db, COLLECTIONS.SUBSCRIBERS);
    const q = query(subscribersRef, where('email', '==', normalizedEmail));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      // Add new subscriber
      await addDoc(subscribersRef, {
        email: normalizedEmail,
        subscribedAt: serverTimestamp()
      });
      // Increment the counter doc
      const counterRef = doc(db, COLLECTIONS.META, SUBSCRIBER_COUNTER_DOC);
      await setDoc(counterRef, { count: increment(1) }, { merge: true });
      return { isNewSubscriber: true };
    } else {
      return { isNewSubscriber: false };
    }
  } catch (error) {
    console.error('Error subscribing user:', error);
    throw error;
  }
};

export const getSubscribersCount = async (): Promise<number> => {
  try {
    // Read from the counter doc instead of scanning the full collection
    const counterRef = doc(db, COLLECTIONS.META, SUBSCRIBER_COUNTER_DOC);
    const counterDoc = await getDoc(counterRef);
    if (counterDoc.exists()) {
      return (counterDoc.data().count as number) || 0;
    }
    // Fallback: count from collection if counter doc doesn't exist yet
    const subscribersRef = collection(db, COLLECTIONS.SUBSCRIBERS);
    const querySnapshot = await getDocs(subscribersRef);
    return querySnapshot.size;
  } catch (error) {
    console.error('Error getting subscribers count:', error);
    return 0;
  }
};

export const getSubscribers = async (): Promise<string[]> => {
  try {
    const subscribersRef = collection(db, COLLECTIONS.SUBSCRIBERS);
    const querySnapshot = await getDocs(subscribersRef);
    return querySnapshot.docs.map(doc => doc.data().email);
  } catch (error) {
    console.error('Error getting subscribers:', error);
    return [];
  }
};

// --- Firestore Service: Comments ---

export const getComments = async (postId: string, userId?: string): Promise<Comment[]> => {
  try {
    const commentsRef = collection(db, COLLECTIONS.COMMENTS);
    // Get all comments for this post (including replies)
    const q = query(commentsRef, where('postId', '==', postId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return [];
    }
    
    // Get all reactions for this post (handle errors gracefully)
    let reactionsMap: { [commentId: string]: { [reactionType: string]: number } } = {};
    let userReactionsMap: { [commentId: string]: string[] } = {};
    
    try {
      const reactionsRef = collection(db, COLLECTIONS.REACTIONS);
      const reactionsQuery = query(reactionsRef, where('postId', '==', postId));
      const reactionsSnapshot = await getDocs(reactionsQuery);
      
      reactionsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const commentId = data.commentId;
        const reactionType = data.reactionType;
        
        if (!commentId || !reactionType) {
          return;
        }
        
        if (!reactionsMap[commentId]) {
          reactionsMap[commentId] = {};
        }
        // Initialize count if not exists
        if (typeof reactionsMap[commentId][reactionType] !== 'number') {
          reactionsMap[commentId][reactionType] = 0;
        }
        reactionsMap[commentId][reactionType]++;
        
        // Track user's reactions
        if (userId && data.userId === userId) {
          if (!userReactionsMap[commentId]) {
            userReactionsMap[commentId] = [];
          }
          if (!userReactionsMap[commentId].includes(reactionType)) {
            userReactionsMap[commentId].push(reactionType);
          }
        }
      });
      
    } catch (reactionError) {
      console.warn('Error loading reactions (continuing without reactions):', reactionError);
      // Continue without reactions if there's an error
    }
    
    const allComments = querySnapshot.docs.map(doc => {
      const data = doc.data();
      // Handle userAvatar - preserve the value if it exists and is a valid string
      let userAvatar: string | undefined = undefined;
      if (data.userAvatar && typeof data.userAvatar === 'string' && data.userAvatar.trim() !== '') {
        userAvatar = data.userAvatar;
      }
      
      return {
        id: doc.id,
        postId: data.postId,
        userId: data.userId,
        userName: data.userName || 'Anonymous',
        userAvatar: userAvatar,
        content: data.content || '',
        parentId: data.parentId || undefined,
        createdAt: data.createdAt instanceof Timestamp 
          ? data.createdAt.toDate().toISOString() 
          : (data.createdAt || new Date().toISOString()),
        reactions: reactionsMap[doc.id] || {},
        userReactions: userReactionsMap[doc.id] || [],
        replies: [] as Comment[]
      };
    });
    
    // Separate top-level comments and replies
    const topLevelComments = allComments.filter(c => !c.parentId);
    const replies = allComments.filter(c => c.parentId);
    
    // Nest replies under their parent comments
    topLevelComments.forEach(comment => {
      comment.replies = replies
        .filter(reply => reply.parentId === comment.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
    
    // Sort top-level comments (newest first)
    return topLevelComments.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    console.error('Error getting comments:', error);
    return [];
  }
};

export const addComment = async (postId: string, user: User, content: string, parentId?: string): Promise<Comment> => {
  try {
    const commentsRef = collection(db, COLLECTIONS.COMMENTS);
    const commentData: any = {
      postId,
      userId: user.id,
      userName: user.name,
      content,
      createdAt: serverTimestamp()
    };
    
    // Always include userAvatar field - set to the avatar URL if available, otherwise null
    // This ensures the field exists in Firestore even if avatar is undefined
    commentData.userAvatar = (user.avatar && user.avatar.trim() !== '') ? user.avatar : null;
    
    if (parentId) {
      commentData.parentId = parentId;
    }
    
    const docRef = await addDoc(commentsRef, commentData);
    
    return {
      id: docRef.id,
      postId,
      userId: user.id,
      userName: user.name,
      userAvatar: user.avatar || undefined,
      content,
      parentId,
      createdAt: new Date().toISOString(),
      reactions: {},
      userReactions: [],
      replies: []
    };
  } catch (error) {
    console.error('Error adding comment:', error);
    throw error;
  }
};

export const toggleReaction = async (postId: string, commentId: string, userId: string, reactionType: string): Promise<{ count: number, userHasReacted: boolean }> => {
  try {
    if (!postId || !commentId || !userId || !reactionType) {
      throw new Error('Missing required parameters for toggleReaction');
    }
    
    const reactionsRef = collection(db, COLLECTIONS.REACTIONS);
    
    const userReactionsQuery = query(
      reactionsRef, 
      where('commentId', '==', commentId),
      where('userId', '==', userId)
    );
    const userReactionsSnapshot = await getDocs(userReactionsQuery);
    
    const existingReaction = userReactionsSnapshot.docs.find(
      doc => doc.data().reactionType === reactionType
    );
    
    if (existingReaction) {
      await deleteDoc(existingReaction.ref);
      
      const countQuery = query(
        reactionsRef, 
        where('commentId', '==', commentId), 
        where('reactionType', '==', reactionType)
      );
      const countSnapshot = await getDocs(countQuery);
      return { count: countSnapshot.size, userHasReacted: false };
    } else {
      const reactionData = {
        postId,
        commentId,
        userId,
        reactionType,
        createdAt: serverTimestamp()
      };
      
      await addDoc(reactionsRef, reactionData);
      
      const countQuery = query(
        reactionsRef, 
        where('commentId', '==', commentId), 
        where('reactionType', '==', reactionType)
      );
      const countSnapshot = await getDocs(countQuery);
      return { count: countSnapshot.size, userHasReacted: true };
    }
  } catch (error) {
    console.error('Error toggling reaction:', error);
    throw error;
  }
};

// --- Firestore Service: Likes ---

export const toggleLike = async (postId: string, userId: string): Promise<{ liked: boolean, count: number }> => {
  try {
    const likeId = `${postId}_${userId}`;
    const likeRef = doc(db, COLLECTIONS.LIKES, likeId);
    const likeDoc = await getDoc(likeRef);
    
    let liked = false;
    
    if (likeDoc.exists()) {
      // Unlike - remove the document
      await deleteDoc(likeRef);
      liked = false;
    } else {
      // Like - add the document
      await setDoc(likeRef, {
        postId,
        userId,
        likedAt: serverTimestamp()
      });
      liked = true;
    }
    
    // Get the actual count from likes collection (source of truth)
    const count = await getLikeCount(postId);
    
    // Sync the post's likesCount with the actual count
    await syncPostLikesCount(postId, count);
    
    return { liked, count };
  } catch (error) {
    console.error('Error toggling like:', error);
    throw error;
  }
};

// Sync post's likesCount with the actual count from likes collection
const syncPostLikesCount = async (postId: string, actualCount: number): Promise<void> => {
  try {
    const postRef = doc(db, COLLECTIONS.POSTS, postId);
    // Use setDoc with merge:true so it upserts — won't throw if the doc doesn't exist yet
    await setDoc(postRef, { likesCount: actualCount }, { merge: true });
  } catch (error) {
    console.error('Error syncing likes count:', error);
  }
};

const getLikeCount = async (postId: string): Promise<number> => {
  try {
    const likesRef = collection(db, COLLECTIONS.LIKES);
    const q = query(likesRef, where('postId', '==', postId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error('Error getting like count:', error);
    return 0;
  }
};

export const getLikeStatus = async (postId: string, userId?: string): Promise<{ liked: boolean, count: number }> => {
  try {
    const count = await getLikeCount(postId);
    
    if (!userId) {
      return { liked: false, count };
    }
    
    const likeId = `${postId}_${userId}`;
    const likeRef = doc(db, COLLECTIONS.LIKES, likeId);
    const likeDoc = await getDoc(likeRef);
    
    return { liked: likeDoc.exists(), count };
  } catch (error) {
    console.error('Error getting like status:', error);
    return { liked: false, count: 0 };
  }
};

// --- Firestore Service: Posts (Optional - for persistent blog posts) ---

export const savePosts = async (posts: BlogPost[]): Promise<void> => {
  try {
    for (const post of posts) {
      const postRef = doc(db, COLLECTIONS.POSTS, post.id);
      await setDoc(postRef, {
        ...omitUndefinedDeep(post),
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error saving posts:', error);
    throw error;
  }
};

export const getPosts = async (): Promise<BlogPost[] | null> => {
  try {
    const postsRef = collection(db, COLLECTIONS.POSTS);
    const querySnapshot = await getDocs(postsRef);
    
    if (querySnapshot.empty) {
      return null; // Return null to indicate no posts in Firestore, use local defaults
    }
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        excerpt: data.excerpt,
        coverImage: data.coverImage,
        category: data.category,
        tags: data.tags || [],
        blocks: data.blocks || [],
        author: data.author,
        publishedAt: data.publishedAt,
        scheduledAt: data.scheduledAt,
        status: data.status,
        views: data.views || 0,
        likesCount: data.likesCount || 0
      } as BlogPost;
    });
  } catch (error) {
    console.error('Error getting posts:', error);
    return null;
  }
};

/**
 * Persists post content. Uses merge so we do not wipe the document, and omits
 * server-managed counters (`views`, `likesCount`) so `incrementViews` / like
 * updates are not overwritten by stale client state on the next save.
 */
export const savePost = async (post: BlogPost): Promise<void> => {
  requireAuth();
  try {
    const postRef = doc(db, COLLECTIONS.POSTS, post.id);
    const cleaned = omitUndefinedDeep(post) as BlogPost;
    const { views: _views, likesCount: _likes, ...rest } = cleaned;
    await setDoc(
      postRef,
      {
        ...rest,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error('Error saving post:', error);
    throw error;
  }
};

export const deletePost = async (postId: string): Promise<void> => {
  requireAuth();
  try {
    const batch = writeBatch(db);

    // Delete the post document
    batch.delete(doc(db, COLLECTIONS.POSTS, postId));

    // Collect orphaned comments
    const commentsSnap = await getDocs(query(collection(db, COLLECTIONS.COMMENTS), where('postId', '==', postId)));
    commentsSnap.docs.forEach(d => batch.delete(d.ref));

    // Collect orphaned likes
    const likesSnap = await getDocs(query(collection(db, COLLECTIONS.LIKES), where('postId', '==', postId)));
    likesSnap.docs.forEach(d => batch.delete(d.ref));

    // Collect orphaned reactions
    const reactionsSnap = await getDocs(query(collection(db, COLLECTIONS.REACTIONS), where('postId', '==', postId)));
    reactionsSnap.docs.forEach(d => batch.delete(d.ref));

    await batch.commit();
  } catch (error) {
    console.error('Error deleting post:', error);
    throw error;
  }
};

// Increment view count for a post
export const incrementViews = async (postId: string): Promise<void> => {
  try {
    const postRef = doc(db, COLLECTIONS.POSTS, postId);
    await updateDoc(postRef, {
      views: increment(1)
    });
  } catch (error) {
    console.error('Error incrementing views:', error);
    // Don't throw - views are non-critical
  }
};

// --- Firestore Service: User Login Tracking ---

export const recordUserLogin = async (user: User): Promise<void> => {
  try {
    const userRef = doc(db, 'users', user.id);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      await updateDoc(userRef, {
        lastLoginAt: serverTimestamp(),
        loginCount: increment(1),
        name: user.name,
        avatar: user.avatar || null,
      });
    } else {
      await setDoc(userRef, {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar || null,
        firstLoginAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        loginCount: 1,
      });
    }
  } catch (error) {
    console.error('Error recording user login:', error);
  }
};

// --- Firestore Service: Page View Tracking ---

export const recordPageView = async (path: string, userId?: string): Promise<void> => {
  try {
    // Use sessionStorage to track if this path was already recorded this session
    const sessionKey = `pv_${path}`;
    if (typeof window !== 'undefined' && sessionStorage.getItem(sessionKey)) {
      return; // Already recorded this path in this session
    }

    await addDoc(collection(db, COLLECTIONS.PAGE_VIEWS), {
      path,
      userId: userId || null,
      userAgent: navigator.userAgent,
      referrer: document.referrer || null,
      timestamp: serverTimestamp()
    });

    if (typeof window !== 'undefined') {
      sessionStorage.setItem(sessionKey, '1');
    }
  } catch (error) {
    // Page views are non-critical — never throw
    console.error('Error recording page view:', error);
  }
};

export const getPageViews = async (): Promise<{ path: string; count: number }[]> => {
  try {
    const snap = await getDocs(collection(db, COLLECTIONS.PAGE_VIEWS));
    const counts: Record<string, number> = {};
    snap.docs.forEach(d => {
      const path = d.data().path as string;
      counts[path] = (counts[path] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('Error getting page views:', error);
    return [];
  }
};

export const getTotalVisitors = async (): Promise<number> => {
  try {
    const snap = await getDocs(collection(db, COLLECTIONS.PAGE_VIEWS));
    return snap.size;
  } catch (error) {
    console.error('Error getting visitor count:', error);
    return 0;
  }
};

