import { useNavigate } from 'react-router';
import { useCreateDocument } from '../features/document/hooks/useCreateDocument';

export default function HomePage() {
  const navigate = useNavigate();
  const { createDocument, isPending, error } = useCreateDocument();

  async function handleCreate() {
    const document = await createDocument();
    if (document) navigate(`/${document.id}`);
  }

  return (
    <>
      <button
        type="button"
        style={{ all: 'revert' }}
        disabled={isPending}
        onClick={handleCreate}
      >
        추가
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
