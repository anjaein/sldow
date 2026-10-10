import { useNavigate } from 'react-router';

interface DocumentRelationsProps {
  linkedDocumentIds: number[];
  documents: { id: number; title: string }[];
}

export default function DocumentRelations({
  linkedDocumentIds,
  documents,
}: DocumentRelationsProps) {
  const navigate = useNavigate();

  return (
    <select
      aria-label="연결된 노트"
      className="native-select"
      value=""
      onChange={(event) => {
        if (event.target.value) navigate(`/${event.target.value}`);
      }}
    >
      <option value="">{`연결된 노트 ${linkedDocumentIds.length}`}</option>
      {linkedDocumentIds.map((id) => {
        const document = documents.find((item) => item.id === id);
        if (!document) return null;
        return (
          <option key={id} value={id}>
            {document.title}
          </option>
        );
      })}
    </select>
  );
}
