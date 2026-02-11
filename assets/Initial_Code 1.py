import pygame

pygame.init()

WIDTH, HEIGHT = 640, 480
WIN = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Heat Wave Escape - Pac-Man Direction")

clock = pygame.time.Clock()
running = True

# Player (Pac-Man)
player_radius = 16
player_x, player_y = 40, 40
player_speed = 3

# Direction: "right", "left", "up", "down"
direction = "right"

# Pac-Man color (orange)
pacman_color = (255, 140, 0)  # Orange. For red, use (255, 0, 0)


def draw():
    WIN.fill((240, 210, 100))  # Background

    # Draw Pac-Man
    pygame.draw.circle(WIN, pacman_color, (player_x, player_y), player_radius)

    # Draw mouth based on direction
    if direction == "right":
        pygame.draw.polygon(WIN, (240, 210, 100), [
            (player_x, player_y),
            (player_x + player_radius, player_y - player_radius // 2),
            (player_x + player_radius, player_y + player_radius // 2)
        ])
    elif direction == "left":
        pygame.draw.polygon(WIN, (240, 210, 100), [
            (player_x, player_y),
            (player_x - player_radius, player_y - player_radius // 2),
            (player_x - player_radius, player_y + player_radius // 2)
        ])
    elif direction == "up":
        pygame.draw.polygon(WIN, (240, 210, 100), [
            (player_x, player_y),
            (player_x - player_radius // 2, player_y - player_radius),
            (player_x + player_radius // 2, player_y - player_radius)
        ])
    elif direction == "down":
        pygame.draw.polygon(WIN, (240, 210, 100), [
            (player_x, player_y),
            (player_x - player_radius // 2, player_y + player_radius),
            (player_x + player_radius // 2, player_y + player_radius)
        ])

    pygame.display.update()


while running:
    clock.tick(60)
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    # Movement and update direction
    keys = pygame.key.get_pressed()
    if keys[pygame.K_UP] and player_y - player_radius > 0:
        player_y -= player_speed
        direction = "up"
    if keys[pygame.K_DOWN] and player_y + player_radius < HEIGHT:
        player_y += player_speed
        direction = "down"
    if keys[pygame.K_LEFT] and player_x - player_radius > 0:
        player_x -= player_speed
        direction = "left"
    if keys[pygame.K_RIGHT] and player_x + player_radius < WIDTH:
        player_x += player_speed
        direction = "right"

    draw()

pygame.quit()
