import pandas as pd
import requests
import os
import random
import time
from dotenv import load_dotenv

# --- SETUP ---
load_dotenv()
TMDB_API_KEY = os.getenv("TMDB_API_KEY")

if not TMDB_API_KEY:
    print("❌ Error: TMDb API key not found. Make sure you have a .env file.")
    exit()

# --- HELPER FUNCTIONS ---

def get_valid_input(prompt):
    """
    NEW: A function to ensure the user input is valid.
    It will loop until 'y', 'n', or 'q' is entered.
    """
    while True:
        vote = input(prompt).lower().strip()
        if vote in ['y', 'n', 'q']:
            return vote
        else:
            print("Invalid input. Please enter 'y', 'n', or 'q'.")

def get_genre_map():
    url = f"https://api.themoviedb.org/3/genre/movie/list?api_key={TMDB_API_KEY}"
    try:
        response = requests.get(url)
        response.raise_for_status()
        genres = response.json()['genres']
        return {genre['id']: genre['name'] for genre in genres}
    except requests.RequestException as e:
        print(f"❌ Could not fetch genre list from TMDb: {e}")
        return None

def get_movie_details(title, genre_map):
    search_url = f"https://api.themoviedb.org/3/search/movie?api_key={TMDB_API_KEY}&query={title}"
    try:
        response = requests.get(search_url)
        if response.status_code != 200:
            error_data = response.json()
            error_message = error_data.get('status_message', 'Unknown API error.')
            print(f"❌ API Error: {error_message} (Status Code: {response.status_code})")
            input("Press Enter to exit. Please check your API key in the .env file.")
            exit()
        
        data = response.json()
        if data['results']:
            movie = data['results'][0]
            genre_ids = movie.get('genre_ids', [])
            genres = [genre_map.get(gid, 'Unknown') for gid in genre_ids]
            return {
                "title": movie.get('title', 'N/A'),
                "overview": movie.get('overview', 'No overview available.'),
                "rating": movie.get('vote_average', 0),
                "release_date": movie.get('release_date', 'N/A'),
                "genres": genres,
            }
    except requests.RequestException as e:
        print(f"❌ Network Error: Could not connect to TMDb. {e}")
    return None

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

# --- MAIN LOGIC ---

genre_lookup = get_genre_map()
if not genre_lookup:
    exit()

try:
    my_watchlist_df = pd.read_csv("my_watchlist.csv")
    my_watched_df = pd.read_csv("my_watched.csv")
    my_ratings_df = pd.read_csv("my_ratings.csv")
    her_watchlist_df = pd.read_csv("her_watchlist.csv")
    her_watched_df = pd.read_csv("her_watched.csv")
    her_ratings_df = pd.read_csv("her_ratings.csv")
except FileNotFoundError as e:
    print(f"❌ Error: Could not find a required file: {e.filename}")
    exit()

my_watchlist = set(my_watchlist_df['Name'])
her_watchlist = set(her_watchlist_df['Name'])
my_watched = set(my_watched_df['Name']).union(set(my_ratings_df['Name']))
her_watched = set(her_watched_df['Name']).union(set(her_ratings_df['Name']))

mutual_watchlist = my_watchlist.intersection(her_watchlist)
show_her_movies = my_watched.intersection(her_watchlist)
show_me_movies = her_watched.intersection(my_watchlist)
combined_pool = mutual_watchlist.union(show_her_movies).union(show_me_movies)
movies_we_both_saw = my_watched.intersection(her_watched)
final_candidate_pool = sorted(list(combined_pool.difference(movies_we_both_saw)))

if not final_candidate_pool:
    print("😢 No potential movies found based on your criteria.")
    exit()

# --- THE INTERACTIVE GAME ---
print(f"✅ Movie pool successfully built! Total options: {len(final_candidate_pool)}")
input("\nPress Enter to start the game...")

random.shuffle(final_candidate_pool)
yes_movies = []
game_quit = False

for movie_title in final_candidate_pool:
    clear_screen()
    details = get_movie_details(movie_title, genre_lookup)
    
    if not details:
        print(f"Could not fetch details for {movie_title}. Skipping.")
        input("Press Enter to continue...")
        continue

    print("--------------------------------------------------")
    print(f"🎬 {details['title']} ({details['release_date'][:4]})")
    print(f"⭐ TMDb Rating: {details['rating']}/10")
    print(f"🎭 Genres: {', '.join(details['genres'])}")
    print("--------------------------------------------------")
    print(f"Synopsis: {details['overview']}\n")

    # UPDATED: Using the new validation function
    your_vote = get_valid_input("Your vote (y/n/q): ")
    if your_vote == 'q':
        game_quit = True
        break
    
    partner_vote = get_valid_input("Your girlfriend's vote (y/n/q): ")
    if partner_vote == 'q':
        game_quit = True
        break

    if your_vote == 'y' and partner_vote == 'y':
        yes_movies.append(details)
        print(f"\n✅ Match! '{details['title']}' added to the final showdown.")
        time.sleep(2)

# --- THE FINAL SHOWDOWN ---
clear_screen()

if game_quit:
    print("👋 Game quit. See you next time!")
elif not yes_movies:
    print("😢 Looks like you didn't agree on any movies tonight.")
elif len(yes_movies) == 1:
    winner = yes_movies[0]
    print("🎉 You have a clear winner! 🎉")
    print(f"\nTonight's movie is: {winner['title']}")
else:
    print("--- 🏆 FINAL SHOWDOWN 🏆 ---")
    print("You agreed on multiple movies! Here are the finalists:\n")
    for movie in yes_movies:
        print(f"- {movie['title']}")
    
    print("\nPicking a random winner in 3...")
    time.sleep(1)
    print("2...")
    time.sleep(1)
    print("1...")
    time.sleep(1)

    winner = random.choice(yes_movies)
    print("\n🎉 The winner of the tiebreak is... 🎉")
    print(f"\nTonight's movie is: {winner['title']}")