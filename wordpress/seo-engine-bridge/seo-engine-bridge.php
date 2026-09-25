<?php
/**
 * Plugin Name: SEO Engine Bridge
 * Description: Lets the SEO Optimization Engine write SEO fields (Rank Math / Yoast / built-in), JSON-LD and
 *              robots.txt / ads.txt / llms.txt through the WordPress REST API. Administrator access only.
 * Version:     1.0.0
 * Requires PHP: 7.4
 * License:     MIT
 */

if (!defined('ABSPATH')) {
    exit;
}

const SEO_ENGINE_BRIDGE_VERSION = '1.0.0';

function seo_engine_seo_plugin() {
    if (defined('RANK_MATH_VERSION')) {
        return 'rank_math';
    }
    if (defined('WPSEO_VERSION')) {
        return 'yoast';
    }
    return 'none';
}

function seo_engine_can_manage() {
    return current_user_can('manage_options');
}

/* ------------------------------------------------------------------ writable post meta */

add_action('init', function () {
    $keys = array(
        // Rank Math
        'rank_math_title', 'rank_math_description', 'rank_math_canonical_url',
        'rank_math_facebook_title', 'rank_math_facebook_description',
        // Yoast
        '_yoast_wpseo_title', '_yoast_wpseo_metadesc', '_yoast_wpseo_canonical',
        '_yoast_wpseo_opengraph-title', '_yoast_wpseo_opengraph-description',
        // Built-in fallback + JSON-LD
        '_seo_engine_title', '_seo_engine_description', '_seo_engine_canonical',
        '_seo_engine_og_title', '_seo_engine_og_description', '_seo_engine_jsonld',
    );
    foreach (array('post', 'page') as $type) {
        foreach ($keys as $key) {
            register_post_meta($type, $key, array(
                'type'          => 'string',
                'single'        => true,
                'show_in_rest'  => true,
                'auth_callback' => function () {
                    return current_user_can('edit_posts');
                },
            ));
        }
    }
});

/* ------------------------------------------------------------------ REST routes */

add_action('rest_api_init', function () {
    register_rest_route('seo-engine/v1', '/status', array(
        'methods'             => 'GET',
        'permission_callback' => 'seo_engine_can_manage',
        'callback'            => function () {
            return array(
                'installed'     => true,
                'version'       => SEO_ENGINE_BRIDGE_VERSION,
                'seo_plugin'    => seo_engine_seo_plugin(),
                'page_on_front' => (int) get_option('page_on_front'),
                'home'          => home_url('/'),
                'files'         => array_keys((array) get_option('seo_engine_files', array())),
            );
        },
    ));

    register_rest_route('seo-engine/v1', '/files', array(
        'methods'             => 'POST',
        'permission_callback' => 'seo_engine_can_manage',
        'args'                => array(
            'path'    => array('required' => true, 'enum' => array('robots.txt', 'ads.txt', 'llms.txt')),
            'content' => array('required' => true, 'type' => 'string'),
        ),
        'callback'            => function (WP_REST_Request $req) {
            $files = (array) get_option('seo_engine_files', array());
            $files[$req['path']] = (string) $req['content'];
            update_option('seo_engine_files', $files, false);
            return array('ok' => true, 'path' => $req['path']);
        },
    ));

    register_rest_route('seo-engine/v1', '/sitewide-jsonld', array(
        'methods'             => 'POST',
        'permission_callback' => 'seo_engine_can_manage',
        'callback'            => function (WP_REST_Request $req) {
            $all = (array) get_option('seo_engine_sitewide_jsonld', array());
            $all[sanitize_key((string) $req['type'])] = $req['schema'];
            update_option('seo_engine_sitewide_jsonld', $all, false);
            return array('ok' => true);
        },
    ));

    register_rest_route('seo-engine/v1', '/home-meta', array(
        'methods'             => 'POST',
        'permission_callback' => 'seo_engine_can_manage',
        'callback'            => function (WP_REST_Request $req) {
            $meta = array_map('sanitize_text_field', (array) $req['meta']);
            update_option('seo_engine_home_meta', array_merge((array) get_option('seo_engine_home_meta', array()), $meta), false);
            return array('ok' => true);
        },
    ));
});

/* ------------------------------------------------------------------ virtual files */

add_filter('robots_txt', function ($output) {
    $files = (array) get_option('seo_engine_files', array());
    return isset($files['robots.txt']) ? $files['robots.txt'] : $output;
}, 999);

add_action('parse_request', function () {
    $path = trim((string) parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/');
    if (!in_array($path, array('ads.txt', 'llms.txt'), true)) {
        return;
    }
    $files = (array) get_option('seo_engine_files', array());
    if (!isset($files[$path])) {
        return;
    }
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: public, max-age=3600');
    echo $files[$path]; // phpcs:ignore WordPress.Security.EscapeOutput -- plain text file body
    exit;
}, 0);

/* ------------------------------------------------------------------ head output */

function seo_engine_meta($key) {
    if (is_front_page() && !get_option('page_on_front')) {
        $home = (array) get_option('seo_engine_home_meta', array());
        return isset($home[$key]) ? $home[$key] : '';
    }
    return is_singular() ? (string) get_post_meta(get_queried_object_id(), $key, true) : '';
}

// Built-in title/description/canonical/OG only when no SEO plugin handles them.
add_filter('pre_get_document_title', function ($title) {
    if (seo_engine_seo_plugin() !== 'none') {
        return $title;
    }
    $custom = seo_engine_meta('_seo_engine_title');
    return $custom !== '' ? $custom : $title;
}, 20);

add_action('wp_head', function () {
    if (seo_engine_seo_plugin() === 'none') {
        $desc = seo_engine_meta('_seo_engine_description');
        if ($desc !== '') {
            printf("<meta name=\"description\" content=\"%s\">\n", esc_attr($desc));
        }
        $canonical = seo_engine_meta('_seo_engine_canonical');
        if ($canonical !== '') {
            remove_action('wp_head', 'rel_canonical');
            printf("<link rel=\"canonical\" href=\"%s\">\n", esc_url($canonical));
        }
        foreach (array('og:title' => '_seo_engine_og_title', 'og:description' => '_seo_engine_og_description') as $prop => $key) {
            $val = seo_engine_meta($key);
            if ($val !== '') {
                printf("<meta property=\"%s\" content=\"%s\">\n", esc_attr($prop), esc_attr($val));
            }
        }
    }

    $blocks = array_values((array) get_option('seo_engine_sitewide_jsonld', array()));
    if (is_singular()) {
        $page_blocks = json_decode((string) get_post_meta(get_queried_object_id(), '_seo_engine_jsonld', true), true);
        if (is_array($page_blocks)) {
            $blocks = array_merge($blocks, array_values($page_blocks));
        }
    }
    foreach ($blocks as $block) {
        echo "<script type=\"application/ld+json\">" .
            wp_json_encode($block, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) .
            "</script>\n";
    }
}, 5);
