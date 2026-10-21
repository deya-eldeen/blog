require "set"

module Jekyll
  # Counts the topics in each roadmap guide's `{: .roadmap-topics}` lists, and how many of
  # them link to a published post or page, so the roadmap cards can show progress.
  # Topics that link to a published post are then shown as article cards above their list.
  class RoadmapProgressGenerator < Generator
    priority :low

    TOPICS_MARKER = /^\{:\s*\.roadmap-topics\s*\}\s*$/
    LIST_ITEM = /^\s*[-*]\s+(.*)$/
    LINK_TARGET = /\]\(([^)\s]+)/

    def generate(site)
      published = published_urls(site)
      posts = site.posts.docs.to_h { |post| [normalize(post.url, site), post.url] }

      site.pages.each do |page|
        next unless page.content.match?(TOPICS_MARKER)

        done = 0
        total = 0
        topic_items(page.content).each do |item|
          total += 1
          target = item[LINK_TARGET, 1]
          done += 1 if target && published.include?(normalize(target, site))
        end

        page.data["roadmap_progress"] = { "done" => done, "total" => total }
        page.content = with_article_cards(page.content, posts, site)
      end
    end

    private

    # Moves list items that link to a published post into a grid of article cards placed
    # before the list. The list keeps the remaining topics, or disappears if none are left.
    def with_article_cards(content, posts, site)
      output = []
      list = []
      content.each_line do |line|
        if line.match?(LIST_ITEM)
          list << line
        elsif line.match?(TOPICS_MARKER)
          articles, topics = list.partition { |item| post_url(item, posts, site) }
          output << article_grid(articles.map { |item| post_url(item, posts, site) }) if articles.any?
          output.concat(topics) << line if topics.any?
          list = []
        else
          output.concat(list) << line
          list = []
        end
      end
      output.concat(list).join
    end

    def post_url(item, posts, site)
      target = item[LINK_TARGET, 1]
      target && posts[normalize(target, site)]
    end

    def article_grid(urls)
      cards = urls.map do |url|
        "{%- assign roadmap_post = site.posts | where: \"url\", \"#{url}\" | first -%}" \
          "{%- include blog/article_card.liquid post=roadmap_post -%}"
      end
      "<div class=\"article-grid roadmap-articles\">#{cards.join}</div>\n\n"
    end

    # List items that belong to a list followed by the `{: .roadmap-topics}` marker.
    def topic_items(content)
      items = []
      current = []
      content.each_line do |line|
        if (match = line.match(LIST_ITEM))
          current << match[1]
        elsif line.match?(TOPICS_MARKER)
          items.concat(current)
          current = []
        else
          current = []
        end
      end
      items
    end

    def published_urls(site)
      (site.posts.docs + site.pages).map { |doc| normalize(doc.url, site) }.to_set
    end

    def normalize(url, site)
      path = url.sub(/\{\{\s*site\.(url|baseurl)\s*\}\}/, "")
      path = path.sub(site.config["url"].to_s, "") unless site.config["url"].to_s.empty?
      path = path.split(/[?#]/).first.to_s
      path = "/#{path}" unless path.start_with?("/")
      path = path.sub(/(index)?\.html\z/, "")
      path.end_with?("/") ? path : "#{path}/"
    end
  end
end
