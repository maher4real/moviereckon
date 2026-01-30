-- Create profiles table linked to auth.users
CREATE TABLE public.profiles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create watch_history table
CREATE TABLE public.watch_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content_id INTEGER NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('movie', 'tv')),
    title TEXT NOT NULL,
    poster_path TEXT,
    genres INTEGER[] DEFAULT '{}',
    language TEXT NOT NULL DEFAULT 'en',
    watched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, content_id, content_type)
);

-- Create liked_items table
CREATE TABLE public.liked_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content_id INTEGER NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('movie', 'tv')),
    title TEXT NOT NULL,
    poster_path TEXT,
    liked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, content_id, content_type)
);

-- Create user_preferences table
CREATE TABLE public.user_preferences (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    preferred_languages TEXT[] DEFAULT '{}',
    preferred_genres INTEGER[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liked_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Create helper function to check ownership
CREATE OR REPLACE FUNCTION public.is_owner(record_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT record_user_id = auth.uid()
$$;

-- Profiles RLS policies
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (is_owner(user_id));

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (is_owner(user_id));

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (is_owner(user_id));

CREATE POLICY "Users can delete their own profile"
ON public.profiles FOR DELETE
TO authenticated
USING (is_owner(user_id));

-- Watch history RLS policies
CREATE POLICY "Users can view their own watch history"
ON public.watch_history FOR SELECT
TO authenticated
USING (is_owner(user_id));

CREATE POLICY "Users can insert their own watch history"
ON public.watch_history FOR INSERT
TO authenticated
WITH CHECK (is_owner(user_id));

CREATE POLICY "Users can update their own watch history"
ON public.watch_history FOR UPDATE
TO authenticated
USING (is_owner(user_id));

CREATE POLICY "Users can delete their own watch history"
ON public.watch_history FOR DELETE
TO authenticated
USING (is_owner(user_id));

-- Liked items RLS policies
CREATE POLICY "Users can view their own liked items"
ON public.liked_items FOR SELECT
TO authenticated
USING (is_owner(user_id));

CREATE POLICY "Users can insert their own liked items"
ON public.liked_items FOR INSERT
TO authenticated
WITH CHECK (is_owner(user_id));

CREATE POLICY "Users can update their own liked items"
ON public.liked_items FOR UPDATE
TO authenticated
USING (is_owner(user_id));

CREATE POLICY "Users can delete their own liked items"
ON public.liked_items FOR DELETE
TO authenticated
USING (is_owner(user_id));

-- User preferences RLS policies
CREATE POLICY "Users can view their own preferences"
ON public.user_preferences FOR SELECT
TO authenticated
USING (is_owner(user_id));

CREATE POLICY "Users can insert their own preferences"
ON public.user_preferences FOR INSERT
TO authenticated
WITH CHECK (is_owner(user_id));

CREATE POLICY "Users can update their own preferences"
ON public.user_preferences FOR UPDATE
TO authenticated
USING (is_owner(user_id));

CREATE POLICY "Users can delete their own preferences"
ON public.user_preferences FOR DELETE
TO authenticated
USING (is_owner(user_id));

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
BEFORE UPDATE ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, username)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', 'User'));
    
    INSERT INTO public.user_preferences (user_id)
    VALUES (NEW.id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for auto-creating profile
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();