export const BILLING_GROUP_STORAGE_KEY = 'billing.activeGroupId'
export const BILLING_GROUP_CHANGE_EVENT = 'billing-group-change'
export const BILLING_GROUPS_UPDATED_EVENT = 'billing-groups-updated'
export const BILLING_STATUS_UPDATED_EVENT = 'billing-status-updated'

export function readStoredBillingGroupId() {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(BILLING_GROUP_STORAGE_KEY)
  return value && value.trim().length > 0 ? value : null
}

export function writeStoredBillingGroupId(groupId: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(BILLING_GROUP_STORAGE_KEY, groupId)
  window.dispatchEvent(
    new CustomEvent(BILLING_GROUP_CHANGE_EVENT, {
      detail: {
        groupId,
      },
    }),
  )
}

export function notifyBillingGroupsUpdated(groupId?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(BILLING_GROUPS_UPDATED_EVENT, {
      detail: {
        groupId,
      },
    }),
  )
}

export function notifyBillingStatusUpdated(groupId?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(BILLING_STATUS_UPDATED_EVENT, {
      detail: {
        groupId,
      },
    }),
  )
}
