-- Разрешение на удаление собственных встреч
create policy "Users can delete own meetings."
  on meetings for delete
  using ( auth.uid() = user_id );
