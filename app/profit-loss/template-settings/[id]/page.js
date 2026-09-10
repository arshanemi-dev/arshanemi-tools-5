import TemplateBuilder from '@/components/templateSettings/TemplateBuilder';

export default async function EditTemplatePage({ params }) {
  const { id } = await params;
  return <TemplateBuilder templateId={id} />;
}
