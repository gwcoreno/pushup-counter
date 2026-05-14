import { createServerSupabase } from '@/utils/supabase/server';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type TodoRow = { id: number; name: string };

export default async function TodosPage() {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.from('todos').select();

  if (error) {
    return (
      <main className="min-h-screen p-8 max-w-lg mx-auto">
        <p className="text-red-600">{error.message}</p>
        <p className="text-sm text-muted mt-4">
          Create a <code className="font-mono">todos</code> table in Supabase (with{' '}
          <code className="font-mono">id</code>, <code className="font-mono">name</code>) or skip this
          demo.
        </p>
        <Link href="/" className="text-sm underline mt-6 inline-block">
          ← Back home
        </Link>
      </main>
    );
  }

  const todos = data as TodoRow[] | null;

  return (
    <main className="min-h-screen p-8 max-w-lg mx-auto">
      <Link href="/" className="text-sm underline mb-6 inline-block">
        ← Back home
      </Link>
      <h1 className="text-2xl font-bold mb-4">Todos</h1>
      <ul className="list-disc pl-6 space-y-1">
        {todos?.map((todo) => (
          <li key={todo.id}>{todo.name}</li>
        ))}
      </ul>
      {(!todos || todos.length === 0) && (
        <p className="text-sm text-muted mt-4">No rows yet.</p>
      )}
    </main>
  );
}
