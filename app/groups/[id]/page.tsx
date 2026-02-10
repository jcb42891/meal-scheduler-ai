import { GroupManageClient } from './client-component'

type GroupPageProps = {
  params: Promise<{ id: string }>
}

export default async function GroupManagePage({ params }: GroupPageProps) {
  const { id } = await params
  return <GroupManageClient groupId={id} />
}
