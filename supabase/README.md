# Supabase

## Aplicar a migration da Fase 1

Use a CLI para preservar o histórico de migrations do projeto. Não crie as tabelas manualmente pelo Table Editor ou SQL Editor, pois isso deixa o banco remoto fora de sincronia com os arquivos versionados.

1. Instale a CLI sob demanda e autentique-se:

   ```sh
   npx supabase login
   ```

2. Inicialize a configuração local caso `supabase/config.toml` ainda não exista:

   ```sh
   npx supabase init
   ```

3. Vincule este diretório ao projeto correto. O `project-ref` é o identificador presente na URL do Dashboard, não a URL completa:

   ```sh
   npx supabase link --project-ref <project-ref>
   ```

4. Confira a migration que será aplicada e, então, aplique-a:

   ```sh
   npx supabase db push --dry-run
   npx supabase db push
   ```

5. Confirme que a migration consta no histórico remoto:

   ```sh
   npx supabase migration list
   ```

Nunca use `supabase db reset --linked` neste projeto de produção: ele apaga o schema remoto antes de reaplicar as migrations.

## Verificação no Dashboard

No SQL Editor, execute apenas esta consulta de leitura. O resultado deve conter as seis tabelas listadas:

```sql
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'accounts',
    'categories',
    'transactions',
    'category_rules',
    'imports',
    'insights'
  )
order by tablename;
```

## Credenciais do PWA

No painel, abra **Connect** ou **Settings > API Keys** e copie somente a URL do projeto e a **Publishable key** para `.env.local`. A chave legada `anon` também funciona como alternativa temporária.

Nunca coloque uma secret key, service_role key ou a chave da Anthropic em uma variável `VITE_*`: essas variáveis são incluídas no JavaScript entregue pelo navegador.
