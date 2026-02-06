/**
 * Rider App Home - Redirects to Tasks
 */

import { redirect } from 'next/navigation';

export default function RiderHomePage() {
  redirect('/rider/tasks');
}
