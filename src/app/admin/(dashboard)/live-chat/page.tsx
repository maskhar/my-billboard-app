import CS_InboxLayout from '../../_components/cs/CS_InboxLayout';
import { getChatSessions } from './actions';

export default async function LiveChatPage() {
  const sessions = await getChatSessions();
  
  return (
    <CS_InboxLayout sessions={sessions} />
  );
}