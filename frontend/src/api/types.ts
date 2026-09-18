// Mirrors API_DESIGN.md §3–§6 (ADR-018f). Timestamps are ISO strings.

export interface Me {
  id: string
  email: string | null
  emailVerified: boolean
  name: string | null
}

export interface Collection {
  id: string
  name: string
  ownerId: string
  createdAt: string
  updatedAt: string
}

export interface Bookmark {
  id: string
  url: string
  title: string
  notes: string | null
  collectionId: string | null
  ownerId: string
  createdAt: string
  updatedAt: string
}

export interface Page<T> {
  data: T[]
  nextCursor: string | null
}

export interface FieldError {
  field: string
  message: string
}

/** RFC 9457 Problem Details as returned by the API (API_DESIGN §2). */
export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail: string
  code: string
  errors?: FieldError[]
  bookmarkCount?: number
}

export interface BookmarkInput {
  url: string
  title: string
  notes: string | null
  collectionId: string | null
}

/** Owner view of a share (API_DESIGN sharing section). No recipient user id. */
export interface Share {
  id: string
  collectionId: string
  email: string | null
  createdAt: string
}

/** Recipient view: no ownerId, no other users' ids. */
export interface SharedCollection {
  id: string
  name: string
  ownerEmail: string | null
  sharedAt: string
  createdAt: string
  updatedAt: string
}

export interface SharedBookmark {
  id: string
  url: string
  title: string
  notes: string | null
  collectionId: string
  createdAt: string
  updatedAt: string
}
