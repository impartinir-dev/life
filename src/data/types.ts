import type { RepeatUnit } from '../lib/dates'

export type Language = 'en' | 'de'

export interface Profile {
  id: string
  display_name: string
  language: Language
  color: string
}

export interface Household {
  id: string
  name: string
}

/** Columns shared by every module table; see supabase/schema.sql. */
export interface BaseRow {
  id: string
  household_id: string
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface List extends BaseRow {
  name: string
  position: number
}

export interface ListItem extends BaseRow {
  list_id: string
  name: string
  quantity: string | null
  checked: boolean
  checked_at: string | null
}

export interface Todo extends BaseRow {
  title: string
  notes: string | null
  due_date: string | null
  /** null = both of us */
  assignee: string | null
  repeat_unit: RepeatUnit | null
  repeat_every: number
  done: boolean
  done_at: string | null
  done_by: string | null
}

export interface Tables {
  lists: List
  list_items: ListItem
  todos: Todo
}

export type TableName = keyof Tables
export const TABLES: TableName[] = ['lists', 'list_items', 'todos']
